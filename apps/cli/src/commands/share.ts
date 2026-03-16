import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { createAdapter } from "../lib/adapter.js";

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

export function registerShareCommands(program: Command) {
  const share = program.command("share").description("Share link management");

  // CLI-016
  share
    .command("create <secret-name>")
    .option("--project <p>", "Project name")
    .option("--expires <duration>", "Expiry duration (e.g. 1h, 7d)", "24h")
    .option("--views <n>", "Max view count", parseInt)
    .option("--recipient-key <pubkey>", "Recipient SSH public key (locks link to recipient)")
    .action(async (secretName, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const projects = await adapter.listProjects(session.userId);
        const project = opts.project
          ? projects.find((p) => p.name === opts.project)
          : projects[0];
        if (!project) { console.error("Project not found."); process.exit(1); }
        const secrets = await adapter.listSecrets(project.id);
        const s = secrets.find((x) => x.name === secretName);
        if (!s) { console.error(`Secret "${secretName}" not found.`); process.exit(1); }
        const { version } = await adapter.getSecret(s.id);
        const expiresAt = new Date(Date.now() + parseDuration(opts.expires)).toISOString();
        let encryptedPayload: string;
        let mode: "TIME_LIMITED" | "RECIPIENT_LOCKED";
        if (opts.recipientKey) {
          mode = "RECIPIENT_LOCKED";
          encryptedPayload = `age-encrypted:${version.encryptedValue}`;
          console.warn("Note: RECIPIENT_LOCKED requires age-encryption library. Using placeholder.");
        } else {
          mode = "TIME_LIMITED";
          const shareKeyBytes = new Uint8Array(32);
          crypto.getRandomValues(shareKeyBytes);
          encryptedPayload = version.encryptedValue;
        }
        const link = await adapter.createShareLink({
          secretId: s.id,
          secretVersionId: version.id,
          createdBy: session.userId,
          mode,
          encryptedPayload,
          expiresAt,
          maxViews: opts.views,
          recipientPublicKey: opts.recipientKey,
        });
        console.log(`✓ Share link created: ${link.id}`);
        console.log(`  Mode: ${link.mode}  Expires: ${expiresAt}`);
        if (opts.views) console.log(`  Max views: ${opts.views}`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-017
  share
    .command("list <secret-name>")
    .option("--project <p>", "Project name")
    .action(async (secretName, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const projects = await adapter.listProjects(session.userId);
        const project = opts.project
          ? projects.find((p) => p.name === opts.project)
          : projects[0];
        if (!project) { console.error("Project not found."); process.exit(1); }
        const secrets = await adapter.listSecrets(project.id);
        const s = secrets.find((x) => x.name === secretName);
        if (!s) { console.error("Secret not found."); process.exit(1); }
        const links = await adapter.listShareLinks(s.id);
        if (links.length === 0) { console.log("No share links."); return; }
        for (const l of links) {
          console.log(`  ${l.id}  [${l.status}]  ${l.mode}  expires:${l.expiresAt}  views:${l.viewCount}/${l.maxViews ?? "∞"}`);
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
    .option("--key <shareKey>", "Decryption key (from URL fragment)")
    .action(async (linkId, opts) => {
      const config = loadConfig();
      try {
        const adapter = createAdapter(config);
        const { encryptedPayload, mode } = await adapter.accessShareLink(linkId);
        if (mode === "TIME_LIMITED") {
          if (!opts.key) {
            console.error("Error: --key required for TIME_LIMITED links (from URL fragment)");
            process.exit(1);
          }
          console.log(`Encrypted payload (decrypt with shareKey): ${encryptedPayload}`);
          console.log("Note: Client-side decryption with shareKey not yet implemented in CLI.");
        } else {
          console.log("Recipient-locked payload (decrypt with your SSH private key using age):");
          console.log(encryptedPayload);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
