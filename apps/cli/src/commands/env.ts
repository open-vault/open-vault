import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { createAdapter } from "../lib/adapter.js";

async function resolveProject(adapter: Awaited<ReturnType<typeof createAdapter>>, userId: string, name?: string) {
  const projects = await adapter.listProjects(userId);
  const project = name ? projects.find((p) => p.name === name) : projects[0];
  if (!project) throw new Error(name ? `Project "${name}" not found.` : "No projects found. Create one first.");
  return project;
}

export function registerEnvCommands(program: Command) {
  const env = program.command("env").description("Environment management");

  env
    .command("list")
    .description("List environments for a project")
    .option("--project <p>", "Project name")
    .action(async (opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const envs = await adapter.listEnvironments(project.id);
        if (envs.length === 0) { console.log("No environments."); return; }
        for (const e of envs) {
          console.log(`  ${e.name}  (${e.id})`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  env
    .command("create <name>")
    .description("Create an environment")
    .option("--project <p>", "Project name")
    .action(async (name, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const result = await adapter.createEnvironment(project.id, name);
        console.log(`✓ Environment "${result.name}" created (${result.id})`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  env
    .command("delete <name>")
    .description("Delete an environment")
    .option("--project <p>", "Project name")
    .action(async (name, opts) => {
      if (name === "default") {
        console.error('Cannot delete the "default" environment.');
        process.exit(1);
      }
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const project = await resolveProject(adapter, session.userId, opts.project);
        const envs = await adapter.listEnvironments(project.id);
        const e = envs.find((x) => x.name === name);
        if (!e) { console.error(`Environment "${name}" not found.`); process.exit(1); }
        await adapter.deleteEnvironment(e.id);
        console.log(`✓ Environment "${name}" deleted.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
