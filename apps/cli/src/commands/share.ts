import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { createAdapter } from "../lib/adapter.js";
import { deriveMasterKey, decryptValue } from "../lib/crypto.js";

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

/** Encrypt plaintext with a raw AES-GCM key (no key wrapping — for share links). */
async function encryptWithShareKey(shareKey: Uint8Array, plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", shareKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  // payload = base64url(iv) + "." + base64url(ciphertext)
  return Buffer.from(iv).toString("base64url") + "." + Buffer.from(ct).toString("base64url");
}

/** Decrypt a share payload produced by encryptWithShareKey. */
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

export function registerShareCommands(program: Command) {
  const share = program.command("share").description("Share link management");

  // CLI-016
  share
    .command("create <secret-name>")
    .option("--project <p>", "Project name")
    .option("-e, --env <environment>", "Environment name", "default")
    .option("--expires <duration>", "Expiry duration (e.g. 1h, 7d)", "24h")
    .option("--views <n>", "Max view count", parseInt)
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

        // Decrypt with owner's SSH key, re-encrypt with a random share key
        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const plaintext = await decryptValue(masterKey, version.encryptedValue, version.encryptedKey, version.iv);
        const shareKey = crypto.getRandomValues(new Uint8Array(32));
        const encryptedPayload = await encryptWithShareKey(shareKey, plaintext);

        const expiresAt = new Date(Date.now() + parseDuration(opts.expires)).toISOString();
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
          console.log(`  ${l.id}  [${l.status}]  expires:${l.expiresAt}  views:${l.viewCount}/${l.maxViews ?? "∞"}`);
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
    .requiredOption("--key <shareKey>", "Share key (provided by the link creator)")
    .action(async (linkId, opts) => {
      try {
        const adapter = createAdapter(loadConfig());
        const { encryptedPayload } = await adapter.accessShareLink(linkId);
        const value = await decryptWithShareKey(opts.key, encryptedPayload);
        console.log(value);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
