import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { AppError } from "./_errors";
import { CreateShareLinkSchema } from "./_validators";
import { SHARE_LINK_MAX_EXPIRY_DAYS } from "./_constants";
import { nowISO, requireAuth } from "./_utils";

function newId(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rand = Math.random().toString(16).slice(2, 22);
  return `${ts.slice(0,8)}-${ts.slice(8,12)}-7${rand.slice(0,3)}-${rand.slice(3,7)}-${rand.slice(7,19)}`;
}

// CMD-014
export const create = mutation({
  args: {
    secretId: v.string(),
    mode: v.union(v.literal("TIME_LIMITED"), v.literal("RECIPIENT_LOCKED")),
    encryptedPayload: v.string(),
    expiresAt: v.string(),
    maxViews: v.optional(v.number()),
    recipientPublicKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parse = CreateShareLinkSchema.safeParse(args);
    if (!parse.success) throw AppError.validationError(parse.error.errors[0].message);

    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === args.secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (secret.createdBy !== userId) throw AppError.forbidden();

    const id = newId();
    const now = nowISO();

    await ctx.db.insert("shareLinks", {
      id,
      secretId: args.secretId,
      secretVersionId: secret.currentVersionId!,
      createdBy: userId,
      mode: args.mode,
      encryptedPayload: args.encryptedPayload,
      recipientPublicKey: args.recipientPublicKey,
      maxViews: args.maxViews,
      viewCount: 0,
      expiresAt: args.expiresAt,
      status: "ACTIVE",
      createdAt: now,
    });

    const link = await ctx.db.query("shareLinks").collect().then((l: any[]) => l.find((x) => x.id === id));
    const { _id, _creationTime, ...rest } = link!;
    return rest;
  },
});

// CMD-015
export const access = mutation({
  args: { shareLinkId: v.string() },
  handler: async (ctx, { shareLinkId }) => {
    const link = await ctx.db.query("shareLinks").collect().then((l: any[]) => l.find((x) => x.id === shareLinkId));
    if (!link) throw AppError.notFound("ShareLink");

    // Check terminal states
    if (link.status === "EXPIRED") throw AppError.shareLinkExpired();
    if (link.status === "EXHAUSTED") throw AppError.shareLinkExhausted();
    if (link.status === "REVOKED") throw AppError.shareLinkRevoked();

    // Check time expiry
    if (new Date(link.expiresAt) < new Date()) {
      await ctx.db.patch(link._id, { status: "EXPIRED" });
      throw AppError.shareLinkExpired();
    }

    // Increment view count
    const newCount = link.viewCount + 1;
    const exhausted = link.maxViews != null && newCount >= link.maxViews;
    await ctx.db.patch(link._id, {
      viewCount: newCount,
      status: exhausted ? "EXHAUSTED" : "ACTIVE",
    });

    // Record access
    await ctx.db.insert("shareLinkAccesses", {
      id: newId(),
      shareLinkId,
      accessedAt: new Date().toISOString(),
    });

    return { encryptedPayload: link.encryptedPayload, mode: link.mode };
  },
});

// CMD-016
export const revoke = mutation({
  args: { shareLinkId: v.string() },
  handler: async (ctx, { shareLinkId }) => {
    const userId = await requireAuth(ctx);
    const link = await ctx.db.query("shareLinks").collect().then((l: any[]) => l.find((x) => x.id === shareLinkId));
    if (!link) throw AppError.notFound("ShareLink");
    if (link.createdBy !== userId) throw AppError.forbidden();
    if (link.status !== "ACTIVE") throw AppError.invalidTransition(link.status, "REVOKED");

    await ctx.db.patch(link._id, { status: "REVOKED" });
    return { success: true };
  },
});

// CMD-017 (createdAt DESC — determinism contract)
export const list = query({
  args: { secretId: v.string() },
  handler: async (ctx, { secretId }) => {
    const userId = await requireAuth(ctx);
    const secret = await ctx.db.query("secrets").collect().then((s: any[]) => s.find((x) => x.id === secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (secret.createdBy !== userId) throw AppError.forbidden();

    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_secret", (q) => q.eq("secretId", secretId))
      .collect();

    return links
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(({ _id, _creationTime, encryptedPayload, ...rest }) => rest); // omit payload
  },
});
