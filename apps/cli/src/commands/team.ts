import { Command } from "commander";
import { loadConfig } from "../lib/config.js";
import { loadSession } from "../lib/session.js";
import { createAdapter } from "../lib/adapter.js";
import type { TeamRole } from "@open-vault/adapter";

export function registerTeamCommands(program: Command) {
  const team = program.command("team").description("Team management");

  // CLI-020
  team
    .command("create <name>")
    .action(async (name) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        // encryptedTeamKey is managed client-side; placeholder for now
        const t = await adapter.createTeam(session.userId, name, "");
        console.log(`✓ Team created: ${t.name} (${t.id})`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-021
  team
    .command("invite <email>")
    .requiredOption("--team <id>", "Team ID")
    .option("--role <role>", "Role: VIEWER|EDITOR|OWNER", "VIEWER")
    .action(async (email, opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const member = await adapter.inviteTeamMember(opts.team, {
          invitedEmail: email,
          role: opts.role.toUpperCase() as TeamRole,
          invitedBy: session.userId,
        });
        console.log(`✓ Invited ${email} to team as ${member.role} (expires: ${member.expiresAt})`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-022
  team
    .command("members")
    .requiredOption("--team <id>", "Team ID")
    .action(async (opts) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        const members = await adapter.listTeamMembers(opts.team);
        for (const m of members) {
          console.log(`  ${m.invitedEmail || m.userId}  [${m.role}]  ${m.status}`);
        }
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-023
  team
    .command("role <member-id> <role>")
    .requiredOption("--team <id>", "Team ID")
    .action(async (memberId, role) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        await adapter.setTeamMemberRole(memberId, role.toUpperCase() as TeamRole);
        console.log(`✓ Role updated to ${role.toUpperCase()}.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });

  // CLI-024
  team
    .command("remove <member-id>")
    .action(async (memberId) => {
      const config = loadConfig();
      const session = loadSession();
      if (!session) { console.error("Not logged in."); process.exit(1); }
      try {
        const adapter = createAdapter(config);
        await adapter.removeTeamMember(memberId);
        console.log(`✓ Member ${memberId} removed.`);
      } catch (e: any) {
        console.error("Error:", e.message);
        process.exit(1);
      }
    });
}
