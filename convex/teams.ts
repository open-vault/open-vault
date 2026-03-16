import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AppError } from "./_errors";
import { CreateTeamSchema, InviteTeamMemberSchema, RespondToInvitationSchema } from "./_validators";
import { INVITATION_EXPIRY_HOURS } from "./_constants";
import { nowISO, requireAuth } from "./_utils";

function newId(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.random().toString(16).slice(2, 22);
  return `${ts.slice(0,8)}-${ts.slice(8,12)}-7${rand.slice(0,3)}-${rand.slice(3,7)}-${rand.slice(7,19)}`;
}

// CMD-018
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const parse = CreateTeamSchema.safeParse({ name });
    if (!parse.success) throw AppError.validationError(parse.error.errors[0].message);

    const userId = await requireAuth(ctx);

    const existing = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", name))
      .first();
    if (existing) throw AppError.duplicate(`Team "${name}"`);

    const id = newId();
    const now = nowISO();

    await ctx.db.insert("teams", {
      id,
      name,
      slug: name,
      createdBy: userId,
      encryptedTeamKey: "{}",
      createdAt: now,
      updatedAt: now,
    });

    // Add creator as OWNER member
    await ctx.db.insert("teamMembers", {
      id: newId(),
      teamId: id,
      userId,
      invitedEmail: "",
      invitedBy: userId,
      role: "OWNER",
      status: "ACCEPTED",
      invitedAt: now,
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_HOURS * 3600000).toISOString(),
    });

    const team = await ctx.db.query("teams").collect().then((t: any[]) => t.find((x) => x.id === id));
    const { _id, _creationTime, ...rest } = team!;
    return rest;
  },
});

// CMD-019
export const invite = mutation({
  args: {
    teamId: v.string(),
    email: v.string(),
    role: v.union(v.literal("OWNER"), v.literal("EDITOR"), v.literal("VIEWER")),
  },
  handler: async (ctx, args) => {
    const parse = InviteTeamMemberSchema.safeParse(args);
    if (!parse.success) throw AppError.validationError(parse.error.errors[0].message);

    const userId = await requireAuth(ctx);
    const team = await ctx.db.query("teams").collect().then((t: any[]) => t.find((x) => x.id === args.teamId));
    if (!team) throw AppError.notFound("Team");

    // Caller must be OWNER or EDITOR
    const callerMember = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", userId))
      .first();
    if (!callerMember || !["OWNER", "EDITOR"].includes(callerMember.role)) throw AppError.forbidden();

    const id = newId();
    const now = nowISO();

    await ctx.db.insert("teamMembers", {
      id,
      teamId: args.teamId,
      invitedEmail: args.email,
      invitedBy: userId,
      role: args.role,
      status: "PENDING",
      invitedAt: now,
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_HOURS * 3600000).toISOString(),
    });

    const member = await ctx.db.query("teamMembers").collect().then((m: any[]) => m.find((x) => x.id === id));
    const { _id, _creationTime, ...rest } = member!;
    return rest;
  },
});

// CMD-020
export const respond = mutation({
  args: {
    teamMemberId: v.string(),
    response: v.union(v.literal("ACCEPT"), v.literal("DECLINE")),
  },
  handler: async (ctx, { teamMemberId, response }) => {
    const userId = await requireAuth(ctx);
    const member = await ctx.db.query("teamMembers").collect().then((m: any[]) => m.find((x) => x.id === teamMemberId));
    if (!member) throw AppError.notFound("TeamMember");

    // Guard: responding user's email must match invitedEmail
    const user = await ctx.db.query("users").collect().then((u: any[]) => u.find((x) => x.id === userId));
    if (!user || user.email !== member.invitedEmail) {
      throw AppError.invalidTransition(member.status, response === "ACCEPT" ? "ACCEPTED" : "DECLINED");
    }

    if (member.status !== "PENDING") {
      throw AppError.invalidTransition(member.status, response === "ACCEPT" ? "ACCEPTED" : "DECLINED");
    }

    const newStatus = response === "ACCEPT" ? "ACCEPTED" : "DECLINED";
    await ctx.db.patch(member._id, {
      status: newStatus,
      userId: response === "ACCEPT" ? userId : undefined,
      respondedAt: nowISO(),
    });

    const updated = await ctx.db.query("teamMembers").collect().then((m: any[]) => m.find((x) => x.id === teamMemberId));
    const { _id, _creationTime, ...rest } = updated!;
    return rest;
  },
});

// CMD-021
export const listMembers = query({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    const userId = await requireAuth(ctx);
    const team = await ctx.db.query("teams").collect().then((t: any[]) => t.find((x) => x.id === teamId));
    if (!team) throw AppError.notFound("Team");

    const callerMember = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
      .first();
    if (!callerMember) throw AppError.forbidden();

    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();

    return members.map(({ _id, _creationTime, ...rest }) => rest);
  },
});

// CMD-022
export const setRole = mutation({
  args: {
    teamMemberId: v.string(),
    role: v.union(v.literal("OWNER"), v.literal("EDITOR"), v.literal("VIEWER")),
  },
  handler: async (ctx, { teamMemberId, role }) => {
    const userId = await requireAuth(ctx);
    const member = await ctx.db.query("teamMembers").collect().then((m: any[]) => m.find((x) => x.id === teamMemberId));
    if (!member) throw AppError.notFound("TeamMember");

    const callerMember = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", member.teamId).eq("userId", userId))
      .first();
    if (!callerMember || callerMember.role !== "OWNER") throw AppError.forbidden();

    await ctx.db.patch(member._id, { role });
    const updated = await ctx.db.query("teamMembers").collect().then((m: any[]) => m.find((x) => x.id === teamMemberId));
    const { _id, _creationTime, ...rest } = updated!;
    return rest;
  },
});

// CMD-023
export const removeMember = mutation({
  args: { teamMemberId: v.string() },
  handler: async (ctx, { teamMemberId }) => {
    const userId = await requireAuth(ctx);
    const member = await ctx.db.query("teamMembers").collect().then((m: any[]) => m.find((x) => x.id === teamMemberId));
    if (!member) throw AppError.notFound("TeamMember");

    const callerMember = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", member.teamId).eq("userId", userId))
      .first();
    if (!callerMember || callerMember.role !== "OWNER") throw AppError.forbidden();

    await ctx.db.delete(member._id);
    return { success: true };
  },
});
