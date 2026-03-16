#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerEnvCommands } from "./commands/env.js";
import { registerSecretCommands } from "./commands/secret.js";
import { registerShareCommands } from "./commands/share.js";
import { registerTeamCommands } from "./commands/team.js";
import { registerUICommand } from "./commands/ui.js";
import { registerOnboardCommand } from "./commands/onboard.js";

const program = new Command();

program
  .name("ov")
  .description("Open Secret — E2E encrypted secrets manager")
  .version("0.1.0");

registerAuthCommands(program);
registerProjectCommands(program);
registerEnvCommands(program);
registerSecretCommands(program);
registerShareCommands(program);
registerTeamCommands(program);
registerUICommand(program);
registerOnboardCommand(program);

program.parseAsync(process.argv).catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
