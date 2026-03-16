import { Command } from "commander";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { createAdapter } from "../lib/adapter.js";
import { deriveMasterKey, decryptValue } from "../lib/crypto.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { sha512, sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";

// ─── Utility ────────────────────────────────────────────────────────────────

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid duration: ${str}. Use e.g. 1h, 30m, 7d`);
  const n = parseInt(match[1]);
  switch (match[2]) {
    case "m": return n * 60 * 1000;
    case "h": return n * 3600 * 1000;
    case "d": return n * 86400 * 1000;
    default: throw new Error("Invalid duration unit");
  }
}

// ─── TIME_LIMITED: AES-GCM with random share key ─────────────────────────────

async function encryptWithShareKey(shareKey: Uint8Array, plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", shareKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return Buffer.from(iv).toString("base64url") + "." + Buffer.from(ct).toString("base64url");
}

async function decryptWithShareKey(shareKeyB64: string, payload: string): Promise<string> {
  const shareKeyBytes = Buffer.from(shareKeyB64, "base64url");
  const [ivB64, ctB64] = payload.split(".");
  if (!ivB64 || !ctB64) throw new Error("Invalid share payload format.");
  const key = await crypto.subtle.importKey("raw", shareKeyBytes, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(ivB64, "base64url") },
    key,
    Buffer.from(ctB64, "base64url")
  );
  return new TextDecoder().decode(pt);
}

// ─── RECIPIENT_LOCKED: ECDH X25519 + AES-GCM ─────────────────────────────────

/** modular inverse via extended Euclidean */
function modInv(a: bigint, m: bigint): bigint {
  let [r, r1] = [m, a];
  let [s, s1] = [0n, 1n];
  while (r1 !== 0n) {
    const q = r / r1;
    [r, r1] = [r1, r - q * r1];
    [s, s1] = [s1, s - q * s1];
  }
  return ((s % m) + m) % m;
}

/**
 * Convert a 32-byte compressed Ed25519 public key (y-coordinate, little-endian)
 * to a 32-byte X25519 (Montgomery u-coordinate) public key.
 * Formula: u = (1+y) / (1-y)  mod p   where p = 2^255 - 19
 */
function ed25519PubToX25519(edPub: Uint8Array): Uint8Array {
  const p = (1n << 255n) - 19n;
  const yBytes = new Uint8Array(edPub);
  yBytes[31] &= 0x7f; // clear sign bit
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = y * 256n + BigInt(yBytes[i]);
  const u = ((1n + y) * modInv(((1n - y) % p + p) % p, p)) % p;
  const out = new Uint8Array(32);
  let val = u;
  for (let i = 0; i < 32; i++) { out[i] = Number(val & 0xffn); val >>= 8n; }
  return out;
}

/**
 * Convert a 32-byte Ed25519 seed to an X25519 private scalar.
 * Formula: clamp(SHA-512(seed)[0:32])
 */
function ed25519SeedToX25519(seed: Uint8Array): Uint8Array {
  const h = sha512(seed);
  const key = new Uint8Array(h.slice(0, 32));
  key[0] &= 248;  // clear bits 0,1,2
  key[31] &= 127; // clear bit 7
  key[31] |= 64;  // set bit 6
  return key;
}

/** Parse SSH Ed25519 public key blob → 32-byte raw pubkey */
function parseSSHEd25519Pub(sshPubKeyStr: string): Uint8Array {
  const parts = sshPubKeyStr.trim().split(" ");
  if (!parts[0]?.startsWith("ssh-ed25519")) throw new Error("Not an Ed25519 SSH key");
  const blob = Buffer.from(parts[1]!, "base64");
  // blob = uint32(len "ssh-ed25519") + "ssh-ed25519" + uint32(32) + 32 bytes
  let pos = 0;
  const typeLen = blob.readUInt32BE(pos); pos += 4 + typeLen; // skip keytype string
  const pubLen = blob.readUInt32BE(pos); pos += 4;
  if (pubLen !== 32) throw new Error(`Expected 32-byte pubkey, got ${pubLen}`);
  return new Uint8Array(blob.slice(pos, pos + 32));
}

/** Parse an unencrypted OpenSSH Ed25519 private key → 32-byte seed */
function parseOpenSSHEd25519Seed(privateKeyPath: string): Uint8Array {
  const pem = readFileSync(privateKeyPath, "utf-8");
  const b64 = pem
    .replace(/-----BEGIN OPENSSH PRIVATE KEY-----/, "")
    .replace(/-----END OPENSSH PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const buf = Buffer.from(b64, "base64");

  // Verify magic: "openssh-key-v1\0" (14 chars + null = 15 bytes)
  if (buf.slice(0, 14).toString("ascii") !== "openssh-key-v1") {
    throw new Error("Not an OpenSSH private key");
  }
  let pos = 15; // skip 14-byte magic + 1-byte null

  function readUint32(): number {
    const v = buf.readUInt32BE(pos); pos += 4; return v;
  }
  function readBlob(): Buffer {
    const len = readUint32();
    const v = buf.slice(pos, pos + len); pos += len; return v;
  }

  const ciphername = readBlob().toString();
  if (ciphername !== "none") throw new Error("Encrypted SSH keys are not supported. Run: ssh-keygen -p -N '' to remove passphrase.");
  readBlob(); // kdfname
  readBlob(); // kdfoptions
  const nkeys = readUint32();
  if (nkeys !== 1) throw new Error(`Expected 1 key, found ${nkeys}`);
  readBlob(); // public key blob (skip)
  const privSection = readBlob();

  // Parse private section
  let pp = 0;
  function readPPUint32(): number {
    const v = privSection.readUInt32BE(pp); pp += 4; return v;
  }
  function readPPBlob(): Buffer {
    const len = readPPUint32();
    const v = privSection.slice(pp, pp + len); pp += len; return v;
  }

  const check1 = readPPUint32();
  const check2 = readPPUint32();
  if (check1 !== check2) throw new Error("Private key check mismatch — key may be corrupted or encrypted");

  const keytype = readPPBlob().toString();
  if (keytype !== "ssh-ed25519") throw new Error(`Expected ssh-ed25519, got ${keytype}`);
  readPPBlob(); // pubkey (32 bytes, skip)
  const privkey64 = readPPBlob(); // 64 bytes: seed(32) + pubkey(32)
  if (privkey64.length !== 64) throw new Error(`Expected 64-byte private key blob, got ${privkey64.length}`);
  return new Uint8Array(privkey64.slice(0, 32));
}

/**
 * Encrypt plaintext for one or more recipient X25519 public keys.
 * Supports multiple keys (all Ed25519 keys from GitHub).
 *
 * Payload JSON: { v:1, headers:[{eph,wiv,wk},...], iv, ct }
 * - headers: each wraps the content key for one recipient key
 * - iv/ct: AES-GCM encrypted content
 * Entire JSON is base64url-encoded as the stored payload.
 */
async function encryptForRecipients(recipientX25519Pubs: Uint8Array[], plaintext: string): Promise<string> {
  // Generate a random content key and encrypt the plaintext
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const ck = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", true, ["encrypt"]);
  const contentIv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: contentIv }, ck, new TextEncoder().encode(plaintext));

  // Wrap the content key for each recipient
  const headers: { eph: string; wiv: string; wk: string }[] = [];
  for (const recipientPub of recipientX25519Pubs) {
    const eph = x25519.keygen();
    const sharedSecret = x25519.getSharedSecret(eph.secretKey, recipientPub);
    const wrapKeyBytes = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode("open-vault-share"), 32);
    const wrapKey = await crypto.subtle.importKey("raw", wrapKeyBytes, "AES-GCM", false, ["encrypt"]);
    const wiv = crypto.getRandomValues(new Uint8Array(12));
    const wk = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wiv }, wrapKey, contentKey);
    headers.push({
      eph: Buffer.from(eph.publicKey).toString("base64url"),
      wiv: Buffer.from(wiv).toString("base64url"),
      wk: Buffer.from(wk).toString("base64url"),
    });
  }

  const payload = { v: 1, headers, iv: Buffer.from(contentIv).toString("base64url"), ct: Buffer.from(ct).toString("base64url") };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Decrypt a RECIPIENT_LOCKED payload using the local SSH Ed25519 private key.
 * Tries each wrapped key header until one decrypts successfully.
 */
async function decryptForRecipient(payload: string, sshKeyPath: string): Promise<string> {
  let parsed: { v: number; headers: { eph: string; wiv: string; wk: string }[]; iv: string; ct: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    throw new Error("Invalid recipient-locked payload.");
  }
  if (parsed.v !== 1 || !Array.isArray(parsed.headers)) throw new Error("Unsupported payload version.");

  const seed = parseOpenSSHEd25519Seed(sshKeyPath);
  const myX25519Priv = ed25519SeedToX25519(seed);

  // Try each header
  for (const header of parsed.headers) {
    try {
      const sharedSecret = x25519.getSharedSecret(myX25519Priv, Buffer.from(header.eph, "base64url"));
      const wrapKeyBytes = hkdf(sha256, sharedSecret, undefined, new TextEncoder().encode("open-vault-share"), 32);
      const wrapKey = await crypto.subtle.importKey("raw", wrapKeyBytes, "AES-GCM", false, ["decrypt"]);
      const contentKeyBytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(header.wiv, "base64url") },
        wrapKey,
        Buffer.from(header.wk, "base64url")
      );
      const contentKey = await crypto.subtle.importKey("raw", contentKeyBytes, "AES-GCM", false, ["decrypt"]);
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(parsed.iv, "base64url") },
        contentKey,
        Buffer.from(parsed.ct, "base64url")
      );
      return new TextDecoder().decode(pt);
    } catch {
      // This header wasn't for our key — try the next one
    }
  }
  throw new Error("This link was not encrypted for your key, or the link has been tampered with.");
}

// ─── Project/Env resolution ───────────────────────────────────────────────────

async function resolveProjectAndEnv(
  adapter: Awaited<ReturnType<typeof createAdapter>>,
  userId: string,
  projectName?: string,
  envName = "default"
) {
  const projects = await adapter.listProjects(userId);
  const project = projectName ? projects.find((p) => p.name === projectName) : projects[0];
  if (!project) throw new Error(projectName ? `Project "${projectName}" not found.` : "No projects found.");
  const envs = await adapter.listEnvironments(project.id);
  let env = envs.find((e) => e.name === envName);
  if (!env) {
    if (envName === "default") env = await adapter.createEnvironment(project.id, "default");
    else throw new Error(`Environment "${envName}" not found.`);
  }
  return { project, env };
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function registerShareCommands(program: Command) {
  const share = program.command("share").description("Share link management");

  // CLI-016
  share
    .command("create <secret-name>")
    .option("--project <p>", "Project name")
    .option("-e, --env <environment>", "Environment name", "default")
    .option("--expires <duration>", "Expiry duration (e.g. 1h, 7d)", "24h")
    .option("--views <n>", "Max view count", parseInt)
    .option("--recipient-github <handle>", "Lock to a GitHub user's SSH public key (no --key needed to open)")
    .action(async (secretName, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const { project, env } = await resolveProjectAndEnv(adapter, session.userId, opts.project, opts.env);
        const secrets = await adapter.listSecrets(project.id, env.id);
        const s = secrets.find((x) => x.name === secretName);
        if (!s) { console.error(`Secret "${secretName}" not found.`); process.exit(1); }
        const { version } = await adapter.getSecret(s.id);

        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const plaintext = await decryptValue(masterKey, version.encryptedValue, version.encryptedKey, version.iv);
        const expiresAt = new Date(Date.now() + parseDuration(opts.expires)).toISOString();

        if (opts.recipientGithub) {
          // RECIPIENT_LOCKED: encrypt to recipient's SSH public key
          const handle = opts.recipientGithub;
          process.stderr.write(`Fetching SSH keys for @${handle}...\n`);
          const res = await fetch(`https://github.com/${handle}.keys`);
          if (!res.ok) throw new Error(`Could not fetch GitHub keys for @${handle} (HTTP ${res.status})`);
          const keysText = await res.text();
          const ed25519Keys = keysText.split("\n").filter((l) => l.startsWith("ssh-ed25519"));
          if (ed25519Keys.length === 0) throw new Error(`@${handle} has no Ed25519 SSH key on GitHub. Only Ed25519 keys are supported.`);

          const x25519Pubs = ed25519Keys.map((k) => ed25519PubToX25519(parseSSHEd25519Pub(k)));
          const encryptedPayload = await encryptForRecipients(x25519Pubs, plaintext);

          const link = await adapter.createShareLink({
            secretId: s.id,
            secretVersionId: version.id,
            createdBy: session.userId,
            mode: "RECIPIENT_LOCKED",
            encryptedPayload,
            recipientPublicKey: ed25519Keys.join("\n"),
            expiresAt,
            maxViews: opts.views,
          });

          console.log(`✓ Share link created (locked to @${handle})`);
          console.log(`  ID:      ${link.id}`);
          console.log(`  Expires: ${expiresAt}`);
          if (opts.views) console.log(`  Max views: ${opts.views}`);
          console.log(`\n  Recipient runs:`);
          console.log(`  npx @open-vault/cli share open ${link.id}`);
        } else {
          // TIME_LIMITED: random share key
          const shareKey = crypto.getRandomValues(new Uint8Array(32));
          const encryptedPayload = await encryptWithShareKey(shareKey, plaintext);

          const link = await adapter.createShareLink({
            secretId: s.id,
            secretVersionId: version.id,
            createdBy: session.userId,
            mode: "TIME_LIMITED",
            encryptedPayload,
            expiresAt,
            maxViews: opts.views,
          });

          const shareKeyB64 = Buffer.from(shareKey).toString("base64url");
          console.log(`✓ Share link created`);
          console.log(`  ID:      ${link.id}`);
          console.log(`  Expires: ${expiresAt}`);
          if (opts.views) console.log(`  Max views: ${opts.views}`);
          console.log(`  Key:     ${shareKeyB64}`);
          console.log(`\n  Send both the ID and Key to the recipient:`);
          console.log(`  ov share open ${link.id} --key ${shareKeyB64}`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-017
  share
    .command("list <secret-name>")
    .option("--project <p>", "Project name")
    .option("-e, --env <environment>", "Environment name", "default")
    .action(async (secretName, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const { project, env } = await resolveProjectAndEnv(adapter, session.userId, opts.project, opts.env);
        const secrets = await adapter.listSecrets(project.id, env.id);
        const s = secrets.find((x) => x.name === secretName);
        if (!s) { console.error("Secret not found."); process.exit(1); }
        const links = await adapter.listShareLinks(s.id);
        if (links.length === 0) { console.log("No share links."); return; }
        for (const l of links) {
          console.log(`  ${l.id}  [${l.mode}/${l.status}]  expires:${l.expiresAt}  views:${l.viewCount}/${l.maxViews ?? "∞"}`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-018
  share
    .command("revoke <link-id>")
    .action(async (linkId) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        await adapter.revokeShareLink(linkId);
        console.log(`✓ Share link ${linkId} revoked.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-019
  share
    .command("open <link-id>")
    .description("Decrypt and display a shared secret")
    .option("--key <shareKey>", "Share key (required for time-limited links)")
    .action(async (linkId, opts) => {
      try {
        const config = loadConfig();
        const adapter = createAdapter(config);
        const { encryptedPayload, mode } = await adapter.accessShareLink(linkId);

        if (mode === "RECIPIENT_LOCKED") {
          const sshKeyPath = config.sshKeyPath ?? join(homedir(), ".ssh", "id_ed25519");
          if (!existsSync(sshKeyPath)) {
            console.error(`SSH private key not found at ${sshKeyPath}.`);
            process.exit(1);
          }
          const value = await decryptForRecipient(encryptedPayload, sshKeyPath);
          console.log(value);
        } else {
          if (!opts.key) {
            console.error("This link requires a key. Usage: ov share open <id> --key <key>");
            process.exit(1);
          }
          const value = await decryptWithShareKey(opts.key, encryptedPayload);
          console.log(value);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
