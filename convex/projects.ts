import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AppError } from "./_errors";
import { CreateProjectSchema } from "./_validators";
import { nowISO, requireAuth } from "./_utils";

function newId(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.random().toString(16).slice(2, 22);
  return `${ts.slice(0,8)}-${ts.slice(8,12)}-7${rand.slice(0,3)}-${rand.slice(3,7)}-${rand.slice(7,19)}`;
}

// CMD-004
export const create = mutation({
  args: {
    name: v.string(),
    ownerType: v.union(v.literal("USER"), v.literal("TEAM")),
    teamId: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parse = CreateProjectSchema.safeParse(args);
    if (!parse.success) {
      throw AppError.validationError(parse.error.errors[0].message);
    }

    const userId = await requireAuth(ctx);
    const ownerId = args.ownerType === "USER" ? userId : (args.teamId ?? userId);

    // Check unique (ownerId, ownerType, name)
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_owner_name", (q) =>
        q.eq("ownerId", ownerId).eq("ownerType", args.ownerType).eq("name", args.name)
      )
      .first();
    if (existing && existing.status !== "DELETED") {
      throw AppError.duplicate(`Project "${args.name}"`);
    }

    const id = newId();
    const now = nowISO();
    await ctx.db.insert("projects", {
      id,
      ownerId,
      ownerType: args.ownerType,
      name: args.name,
      description: args.description,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    const project = await ctx.db
      .query("projects")
      .withIndex("by_owner_name", (q) =>
        q.eq("ownerId", ownerId).eq("ownerType", args.ownerType).eq("name", args.name)
      )
      .first();
    const { _id, _creationTime, ...rest } = project!;
    return rest;
  },
});

// CMD-005
export const list = query({
  args: {
    ownerType: v.optional(v.union(v.literal("USER"), v.literal("TEAM"))),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const ownerId = args.ownerType === "TEAM" ? (args.teamId ?? userId) : userId;
    const ownerType = args.ownerType ?? "USER";

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId).eq("ownerType", ownerType))
      .collect();

    return projects
      .filter((p) => p.status === "ACTIVE")
      .map(({ _id, _creationTime, ...rest }) => rest);
  },
});

// CMD-006
export const del = mutation({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const userId = await requireAuth(ctx);
    const project = await ctx.db
      .query("projects")
      .collect()
      .then((p) => p.find((x) => x.id === projectId));

    if (!project || project.status === "DELETED") throw AppError.notFound("Project");
    if (project.ownerId !== userId) throw AppError.forbidden();

    await ctx.db.patch(project._id, { status: "DELETED", updatedAt: nowISO() });
    return { success: true };
  },
});
