import { Command } from "commander";

export function registerOnboardCommand(program: Command) {
  program
    .command("onboard")
    .description("Interactive setup wizard — idempotent, picks up where you left off")
    .action(async () => {
      const { render } = await import("ink");
      const { default: React } = await import("react");
      const { default: Onboard } = await import("../tui/Onboard.js");
      render(React.createElement(Onboard));
    });
}
