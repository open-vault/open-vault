import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { createAdapter } from "../lib/adapter.js";

export function registerProjectCommands(program: Command) {
  const project = program.command("project").description("Project commands");

  // CLI-005
  project
    .command("create <name>")
    .description("Create a project")
    .option("--team <id>", "Create under a team (team ID)")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const result = await adapter.createProject(session.userId, {
          name,
          ownerType: opts.team ? "TEAM" : "USER",
          teamId: opts.team,
        });
        console.log(`✓ Project created: ${result.name} (${result.id})`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-006
  project
    .command("list")
    .description("List all projects")
    .action(async () => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const projects = await adapter.listProjects(session.userId);
        if (projects.length === 0) { console.log("No projects."); return; }
        for (const p of projects) {
          console.log(`  ${p.name}  (${p.id})  [${p.ownerType}]`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-007
  project
    .command("delete <name>")
    .description("Delete a project")
    .action(async (name) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const projects = await adapter.listProjects(session.userId);
        const p = projects.find((x) => x.name === name);
        if (!p) { console.error(`Project "${name}" not found.`); process.exit(1); }
        await adapter.deleteProject(p.id);
        console.log(`✓ Project "${name}" deleted.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
