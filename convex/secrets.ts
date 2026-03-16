import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AppError } from "./_errors";
import { CreateSecretSchema, UpdateSecretSchema } from "./_validators";
import { DEFAULT_PAGE_SIZE } from "./_constants";
import { nowISO, requireAuth } from "./_utils";

function newId(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.random().toString(16).slice(2, 22);
  return `${ts.slice(0,8)}-${ts.slice(8,12)}-7${rand.slice(0,3)}-${rand.slice(3,7)}-${rand.slice(7,19)}`;
}

async function requireProjectAccess(ctx: any, projectId: string, userId: string) {
  const project = await ctx.db
    .query("projects")
    .collect()
    .then((p: any[]) => p.find((x) => x.id === projectId));
  if (!project || project.status === "DELETED") throw AppError.notFound("Project");
  if (project.ownerId !== userId) throw AppError.forbidden();
  return project;
}

// CMD-007: secrets.create
export const create = mutation({
  args: {
    projectId: v.string(),
    name: v.string(),
    type: v.union(v.literal("KV"), v.literal("ENV_FILE"), v.literal("NOTE"), v.literal("JSON")),
    encryptedValue: v.string(),
    encryptedKey: v.string(),
    iv: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parse = CreateSecretSchema.safeParse(args);
    if (!parse.success) throw AppError.validationError(parse.error.errors[0].message);

    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, args.projectId, userId);

    // Check unique (projectId, name)
    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_project_name", (q) => q.eq("projectId", args.projectId).eq("name", args.name))
      .first();
    if (existing && existing.status !== "DELETED") throw AppError.duplicate(`Secret "${args.name}"`);

    const secretId = newId();
    const versionId = newId();
    const now = nowISO();

    await ctx.db.insert("secrets", {
      id: secretId,
      projectId: args.projectId,
      createdBy: userId,
      name: args.name,
      type: args.type,
      description: args.description,
      currentVersionId: versionId,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("secretVersions", {
      id: versionId,
      secretId,
      versionNumber: 1,
      encryptedValue: args.encryptedValue,
      encryptedKey: args.encryptedKey,
      iv: args.iv,
      createdBy: userId,
      createdAt: now,
    });

    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === secretId));
    const version = await ctx.db.query("secretVersions").collect().then((v: any[]) => v.find((x) => x.id === versionId));

    const { _id: sId, _creationTime: sCt, ...secretRest } = secret!;
    const { _id: vId, _creationTime: vCt, ...versionRest } = version!;
    return { secret: secretRest, version: versionRest };
  },
});

// CMD-008: secrets.update
export const update = mutation({
  args: {
    secretId: v.string(),
    encryptedValue: v.string(),
    encryptedKey: v.string(),
    iv: v.string(),
  },
  handler: async (ctx, args) => {
    const parse = UpdateSecretSchema.safeParse(args);
    if (!parse.success) throw AppError.validationError(parse.error.errors[0].message);

    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === args.secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    await requireProjectAccess(ctx, secret.projectId, userId);

    // Count existing versions
    const versions = await ctx.db
      .query("secretVersions")
      .withIndex("by_secret", (q) => q.eq("secretId", args.secretId))
      .collect();
    const nextVersion = versions.length + 1;

    const versionId = newId();
    const now = nowISO();

    await ctx.db.insert("secretVersions", {
      id: versionId,
      secretId: args.secretId,
      versionNumber: nextVersion,
      encryptedValue: args.encryptedValue,
      encryptedKey: args.encryptedKey,
      iv: args.iv,
      createdBy: userId,
      createdAt: now,
    });

    await ctx.db.patch(secret._id, { currentVersionId: versionId, updatedAt: now });

    const version = await ctx.db.query("secretVersions").collect().then((v: any[]) => v.find((x) => x.id === versionId));
    const { _id, _creationTime, ...rest } = version!;
    return rest;
  },
});

// CMD-009: secrets.get
export const get = query({
  args: { secretId: v.string() },
  handler: async (ctx, { secretId }) => {
    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (secret.createdBy !== userId) throw AppError.forbidden();

    const version = await ctx.db.query("secretVersions").collect()
      .then((v: any[]) => v.find((x) => x.id === secret.currentVersionId));
    if (!version) throw AppError.notFound("SecretVersion");

    const { _id: sId, _creationTime: sCt, ...secretRest } = secret;
    const { _id: vId, _creationTime: vCt, ...versionRest } = version;
    return { secret: secretRest, version: versionRest };
  },
});

// CMD-010: secrets.list (name ASC — determinism contract)
export const list = query({
  args: {
    projectId: v.string(),
    type: v.optional(v.union(v.literal("KV"), v.literal("ENV_FILE"), v.literal("NOTE"), v.literal("JSON"))),
  },
  handler: async (ctx, { projectId, type }) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, projectId, userId);

    const secrets = await ctx.db
      .query("secrets")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();

    return secrets
      .filter((s) => s.status === "ACTIVE" && (!type || s.type === type))
      .sort((a, b) => a.name.localeCompare(b.name)) // name ASC
      .map(({ _id, _creationTime, ...rest }) => {
        const { encryptedValue: _, ...safeRest } = rest as any;
        return safeRest;
      });
  },
});

// CMD-011: secrets.delete
export const del = mutation({
  args: { secretId: v.string() },
  handler: async (ctx, { secretId }) => {
    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (secret.createdBy !== userId) throw AppError.forbidden();

    await ctx.db.patch(secret._id, { status: "DELETED", updatedAt: nowISO() });
    return { success: true };
  },
});

// CMD-012: secrets.listVersions (versionNumber DESC)
export const listVersions = query({
  args: { secretId: v.string() },
  handler: async (ctx, { secretId }) => {
    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (secret.createdBy !== userId) throw AppError.forbidden();

    const versions = await ctx.db
      .query("secretVersions")
      .withIndex("by_secret", (q) => q.eq("secretId", secretId))
      .collect();

    return versions
      .sort((a, b) => b.versionNumber - a.versionNumber) // versionNumber DESC
      .map(({ _id, _creationTime, ...rest }) => rest);
  },
});

// CMD-013: secrets.rollback
export const rollback = mutation({
  args: { secretId: v.string(), targetVersionId: v.string() },
  handler: async (ctx, { secretId, targetVersionId }) => {
    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (secret.createdBy !== userId) throw AppError.forbidden();

    const targetVersion = await ctx.db.query("secretVersions").collect()
      .then((v: any[]) => v.find((x) => x.id === targetVersionId && x.secretId === secretId));
    if (!targetVersion) throw AppError.notFound("SecretVersion");

    const allVersions = await ctx.db
      .query("secretVersions")
      .withIndex("by_secret", (q) => q.eq("secretId", secretId))
      .collect();
    const nextVersion = allVersions.length + 1;

    const versionId = newId();
    const now = nowISO();

    await ctx.db.insert("secretVersions", {
      id: versionId,
      secretId,
      versionNumber: nextVersion,
      encryptedValue: targetVersion.encryptedValue,
      encryptedKey: targetVersion.encryptedKey,
      iv: targetVersion.iv,
      createdBy: userId,
      createdAt: now,
    });

    await ctx.db.patch(secret._id, { currentVersionId: versionId, updatedAt: now });

    const version = await ctx.db.query("secretVersions").collect().then((v: any[]) => v.find((x) => x.id === versionId));
    const { _id, _creationTime, ...rest } = version!;
    return rest;
  },
});

// CMD-024: secrets.batchCreate
export const batchCreate = mutation({
  args: {
    projectId: v.string(),
    secrets: v.array(v.object({
      name: v.string(),
      type: v.union(v.literal("KV"), v.literal("ENV_FILE"), v.literal("NOTE"), v.literal("JSON")),
      encryptedValue: v.string(),
      encryptedKey: v.string(),
      iv: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, args.projectId, userId);

    const results = [];
    for (const s of args.secrets) {
      const parse = CreateSecretSchema.safeParse({ ...s, projectId: args.projectId });
      if (!parse.success) throw AppError.validationError(parse.error.errors[0].message);

      const secretId = newId();
      const versionId = newId();
      const now = nowISO();

      await ctx.db.insert("secrets", {
        id: secretId,
        projectId: args.projectId,
        createdBy: userId,
        name: s.name,
        type: s.type,
        currentVersionId: versionId,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("secretVersions", {
        id: versionId,
        secretId,
        versionNumber: 1,
        encryptedValue: s.encryptedValue,
        encryptedKey: s.encryptedKey,
        iv: s.iv,
        createdBy: userId,
        createdAt: now,
      });

      results.push({ id: secretId, name: s.name, type: s.type, projectId: args.projectId });
    }
    return results;
  },
});

// CMD-025: secrets.listForExport
export const listForExport = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, projectId, userId);

    const secrets = await ctx.db
      .query("secrets")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();

    const active = secrets.filter((s) => s.status === "ACTIVE");
    const result = [];
    for (const s of active) {
      const version = await ctx.db.query("secretVersions").collect()
        .then((v: any[]) => v.find((x) => x.id === s.currentVersionId));
      if (!version) continue;
      result.push({
        name: s.name,
        type: s.type,
        encryptedValue: version.encryptedValue,
        encryptedKey: version.encryptedKey,
        iv: version.iv,
      });
    }
    return result;
  },
});

// CMD-026: secrets.search (name ASC)
export const search = query({
  args: { projectId: v.string(), q: v.string() },
  handler: async (ctx, { projectId, q }) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, projectId, userId);

    const secrets = await ctx.db
      .query("secrets")
      .withIndex("by_project", (q2) => q2.eq("projectId", projectId))
      .collect();

    return secrets
      .filter((s) => s.status === "ACTIVE" && s.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ _id, _creationTime, ...rest }) => rest);
  },
});
