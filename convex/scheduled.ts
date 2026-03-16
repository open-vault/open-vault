import { internalMutation } from "./_generated/server";

// FR-027: expire invitations older than 72 hours
export const expireInvitations = internalMutation({
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const pending = await ctx.db
      .query("teamMembers")
      .collect()
      .then((m) => m.filter((x) => x.status === "PENDING" && x.expiresAt < now));

    for (const member of pending) {
      await ctx.db.patch(member._id, { status: "EXPIRED" });
    }
    return { expired: pending.length };
  },
});

// FR-028: expire share links past expiresAt
export const expireShareLinks = internalMutation({
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const active = await ctx.db
      .query("shareLinks")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect()
      .then((l) => l.filter((x) => x.expiresAt < now));

    for (const link of active) {
      await ctx.db.patch(link._id, { status: "EXPIRED" });
    }
    return { expired: active.length };
  },
});
