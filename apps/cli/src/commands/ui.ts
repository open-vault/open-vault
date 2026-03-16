import { Command } from "commander";

export function registerUICommand(program: Command) {
  // CLI-025: ov ui — launches ink TUI
  program
    .command("ui")
    .description("Launch interactive TUI")
    .action(async () => {
      // Dynamic import to avoid loading ink until needed
      const { render } = await import("ink");
      const { default: React } = await import("react");
      const { loadConfig } = await import("../lib/config.js");
      const { loadSession } = await import("../lib/session.js");

      const session = loadSession();
      if (!session) {
        console.error("Not logged in. Run 'ov auth login' first.");
        process.exit(1);
      }

      const { default: App } = await import("../tui/App.js");
      render(React.createElement(App, { session }));
    });
}
