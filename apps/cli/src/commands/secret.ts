import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { deriveMasterKey, encryptValue, decryptValue } from "../lib/crypto.js";
import { createAdapter } from "../lib/adapter.js";
import type { SecretType } from "@open-vault/adapter";

async function resolveProject(adapter: Awaited<ReturnType<typeof createAdapter>>, userId: string, name?: string) {
  const projects = await adapter.listProjects(userId);
  const project = name ? projects.find((p) => p.name === name) : projects[0];
  if (!project) throw new Error(name ? `Project "${name}" not found.` : "No projects found. Create one first.");
  return project;
}

export function registerSecretCommands(program: Command) {
  const secret = program.command("secret").description("Secret management");

  // CLI-008: os secret set
  secret
    .command("set <name>")
    .option("--project <p>", "Project name")
    .option("--type <t>", "Secret type (KV|ENV_FILE|NOTE|JSON)", "KV")
    .option("--file <f>", "Read value from file")
    .option("--value <v>", "Value (or pass via stdin)")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      let value: string;
      if (opts.file) {
        value = require("fs").readFileSync(opts.file, "utf-8");
      } else if (opts.value) {
        value = opts.value;
      } else if (process.stdin.isTTY) {
        value = await new Promise<string>((resolve) => {
          process.stderr.write("Value: ");
          let buf = "";
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.setEncoding("utf8");
          const onData = (ch: string) => {
            if (ch === "\r" || ch === "\n") {
              process.stderr.write("\n");
              process.stdin.removeListener("data", onData);
              process.stdin.setRawMode(false);
              resolve(buf);
            } else if (ch === "\u0003") { // Ctrl+C
              process.stderr.write("\n");
              process.stdin.setRawMode(false);
              process.exit(1);
            } else if (ch === "\u007f" || ch === "\b") { // backspace
              if (buf.length > 0) buf = buf.slice(0, -1);
            } else {
              buf += ch;
            }
          };
          process.stdin.on("data", onData);
        });
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        value = Buffer.concat(chunks).toString("utf-8").trimEnd();
      }
      try {
        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const encrypted = await encryptValue(masterKey, value);
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const secrets = await adapter.listSecrets(project.id);
        const existing = secrets.find((s) => s.name === name);
        if (existing) {
          await adapter.updateSecret(existing.id, session.userId, encrypted);
          console.log(`✓ Secret "${name}" updated.`);
        } else {
          await adapter.createSecret(project.id, session.userId, {
            name,
            type: opts.type.toUpperCase() as SecretType,
            ...encrypted,
          });
          console.log(`✓ Secret "${name}" created.`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-009: os secret get
  secret
    .command("get <name>")
    .option("--project <p>", "Project name")
    .option("--raw", "Output raw value only")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const secrets = await adapter.listSecrets(project.id);
        const s = secrets.find((x) => x.name === name);
        if (!s) { console.error(`Secret "${name}" not found.`); process.exit(1); }
        const { version } = await adapter.getSecret(s.id);
        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const decrypted = await decryptValue(masterKey, version.encryptedValue, version.encryptedKey, version.iv);
        if (opts.raw) {
          process.stdout.write(decrypted);
        } else {
          console.log(`${name}=${decrypted}`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-010: os secret list
  secret
    .command("list")
    .option("--project <p>", "Project name")
    .option("--type <t>", "Filter by type")
    .action(async (opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const secrets = await adapter.listSecrets(project.id, opts.type?.toUpperCase() as SecretType | undefined);
        if (secrets.length === 0) { console.log("No secrets."); return; }
        for (const s of secrets) {
          console.log(`  ${s.name}  [${s.type}]  ${s.id}`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-011: os secret delete
  secret
    .command("delete <name>")
    .option("--project <p>", "Project name")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const secrets = await adapter.listSecrets(project.id);
        const s = secrets.find((x) => x.name === name);
        if (!s) { console.error(`Secret "${name}" not found.`); process.exit(1); }
        await adapter.deleteSecret(s.id);
        console.log(`✓ Secret "${name}" deleted.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-012: os secret versions
  secret
    .command("versions <name>")
    .option("--project <p>", "Project name")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const secrets = await adapter.listSecrets(project.id);
        const s = secrets.find((x) => x.name === name);
        if (!s) { console.error(`Secret "${name}" not found.`); process.exit(1); }
        const versions = await adapter.listSecretVersions(s.id);
        for (const v of versions) {
          const isCurrent = v.id === s.currentVersionId;
          console.log(`  v${v.versionNumber}  ${v.id}  ${v.createdAt}${isCurrent ? "  [current]" : ""}`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-013: os secret rollback
  secret
    .command("rollback <name>")
    .requiredOption("--version <id>", "Version ID to rollback to")
    .option("--project <p>", "Project name")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const secrets = await adapter.listSecrets(project.id);
        const s = secrets.find((x) => x.name === name);
        if (!s) { console.error(`Secret "${name}" not found.`); process.exit(1); }
        const version = await adapter.rollbackSecret(s.id, opts.version, session.userId);
        console.log(`✓ Rolled back to v${version.versionNumber} (new version: ${version.id})`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-014: os secret import
  secret
    .command("import <file>")
    .option("--project <p>", "Project name")
    .action(async (file, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const content = require("fs").readFileSync(file, "utf-8");
        const entries: Array<{ name: string; value: string }> = [];
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx === -1) continue;
          entries.push({ name: trimmed.slice(0, idx), value: trimmed.slice(idx + 1) });
        }
        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const encrypted = await Promise.all(
          entries.map(async (e) => ({
            name: e.name,
            type: "KV" as SecretType,
            ...(await encryptValue(masterKey, e.value)),
          }))
        );
        await adapter.batchCreateSecrets(project.id, session.userId, encrypted);
        console.log(`✓ Imported ${entries.length} secrets.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-015: os secret export
  secret
    .command("export")
    .option("--project <p>", "Project name")
    .option("--output <file>", "Output file (default: stdout)")
    .action(async (opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const items = await adapter.listSecretsForExport(project.id);
        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const lines: string[] = [];
        for (const item of items) {
          const value = await decryptValue(masterKey, item.encryptedValue, item.encryptedKey, item.iv);
          lines.push(`${item.name}=${value}`);
        }
        const output = lines.join("\n") + "\n";
        if (opts.output) {
          require("fs").writeFileSync(opts.output, output);
          console.log(`✓ Exported ${lines.length} secrets to ${opts.output}`);
        } else {
          process.stdout.write(output);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
