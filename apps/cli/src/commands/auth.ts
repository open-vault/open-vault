import { Command } from "commander";
import { loadConfig, saveConfig } from "../lib/config.js";
import { saveSession, clearSession, loadSession } from "../lib/session.js";
import { getSSHPublicKey } from "../lib/crypto.js";
import { createAdapter } from "../lib/adapter.js";

export function registerAuthCommands(program: Command) {
  const auth = program.command("auth").description("Authentication commands");

  // CLI-001: ov auth init
  auth
    .command("init")
    .description("Configure Open Vault backend")
    .option("--key <path>", "Path to SSH private key")
    .option("--adapter <type>", "Adapter type: convex|s3|r2|local", "local")
    .option("--url <convex-url>", "Convex deployment URL (convex adapter)")
    .option("--bucket <name>", "S3/R2 bucket name (s3/r2 adapter)")
    .option("--region <region>", "S3 region (s3 adapter)")
    .option("--endpoint <url>", "R2 endpoint URL (r2 adapter)")
    .option("--prefix <prefix>", "S3/R2 key prefix (s3/r2 adapter)")
    .option("--local-path <path>", "Local vault directory (local adapter)")
    .option("--db-url <url>", "Database connection URL (postgres/mysql adapter)")
    .option("--redis-url <url>", "Redis connection URL (redis adapter)")
    .option("--access-key-id <id>", "AWS/R2 access key ID (s3/r2 adapter)")
    .option("--secret-access-key <key>", "AWS/R2 secret access key (s3/r2 adapter)")
    .action(async (opts) => {
      const config = loadConfig();
      const adapter = opts.adapter ?? config.adapter ?? "local";
      config.adapter = adapter;
      if (opts.key) config.sshKeyPath = opts.key;
      if (opts.url) config.convexUrl = opts.url;
      if (opts.bucket) config.s3Bucket = opts.bucket;
      if (opts.region) config.s3Region = opts.region;
      if (opts.endpoint) config.s3Endpoint = opts.endpoint;
      if (opts.prefix) config.s3Prefix = opts.prefix;
      if (opts.localPath) config.localPath = opts.localPath;
      if (opts.dbUrl) config.databaseUrl = opts.dbUrl;
      if (opts.redisUrl) config.redisUrl = opts.redisUrl;
      if (opts.accessKeyId) config.s3AccessKeyId = opts.accessKeyId;
      if (opts.secretAccessKey) config.s3SecretAccessKey = opts.secretAccessKey;

      try {
        const publicKey = getSSHPublicKey(opts.key ?? config.sshKeyPath);
        console.log("SSH public key found:", publicKey.slice(0, 40) + "...");
        saveConfig(config);
        console.log(`✓ Config saved (adapter: ${adapter}). Run 'ov auth login' to authenticate.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-002: ov auth login
  auth
    .command("login")
    .description("Authenticate with SSH key")
    .action(async () => {
      const config = loadConfig();
      if (!config.sshKeyPath && config.adapter !== "local") {
        console.error("Error: Run 'ov auth init' first.");
        process.exit(1);
      }

      try {
        const publicKey = getSSHPublicKey(config.sshKeyPath);
        const parts = publicKey.split(" ");
        const fingerprint = parts[0] + ":" + parts[1].slice(0, 16);

        const adapter = createAdapter(config);

        let sign: ((challenge: string) => Promise<string>) | undefined;
        if (config.adapter === "convex" || (!config.adapter && config.convexUrl)) {
          const { execSync } = await import("child_process");
          const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
          sign = async (challenge: string) => {
            const tmpFile = `/tmp/ov-challenge-${Date.now()}`;
            writeFileSync(tmpFile, challenge);
            execSync(`ssh-keygen -Y sign -f "${config.sshKeyPath ?? `${process.env.HOME}/.ssh/id_ed25519`}" -n "open-vault" "${tmpFile}" 2>/dev/null`);
            const sig = readFileSync(`${tmpFile}.sig`, "base64url");
            try { unlinkSync(tmpFile); } catch {}
            try { unlinkSync(`${tmpFile}.sig`); } catch {}
            return sig;
          };
        }

        console.log("Authenticating...");
        const { userId, token, expiresAt } = await adapter.authenticate({
          publicKey,
          fingerprint,
          sign,
        });

        saveSession({ token, userId, expiresAt });
        config.userId = userId;
        saveConfig(config);
        console.log(`✓ Authenticated (${config.adapter ?? "local"}).`);
      } catch (e: any) {
        console.error("Authentication failed:", e.message);
        process.exit(1);
      }
    });

  // CLI-003: ov auth logout
  auth
    .command("logout")
    .description("Clear local session")
    .action(() => {
      clearSession();
      console.log("✓ Logged out.");
    });

  // CLI-004: ov auth whoami
  auth
    .command("whoami")
    .description("Print current identity")
    .action(() => {
      const session = loadSession();
      if (!session) {
        console.log("Not logged in. Run 'ov auth login'.");
        return;
      }
      const config = loadConfig();
      console.log(`User ID: ${session.userId}`);
      console.log(`Adapter: ${config.adapter ?? "local"}`);
      console.log(`Session expires: ${session.expiresAt}`);
      if (config.sshKeyPath) console.log(`SSH key: ${config.sshKeyPath}`);
    });
}
