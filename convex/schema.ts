import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    id: v.string(),
    sshPublicKeyFingerprint: v.string(),
    sshPublicKey: v.string(),
    email: v.optional(v.string()),
    displayName: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_fingerprint", ["sshPublicKeyFingerprint"])
    .index("by_email", ["email"]),

  challenges: defineTable({
    fingerprint: v.string(),
    challenge: v.string(),
    expiresAt: v.string(),
    used: v.boolean(),
  }).index("by_fingerprint", ["fingerprint"]),

  sessions: defineTable({
    userId: v.string(),
    token: v.string(),
    expiresAt: v.string(),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  projects: defineTable({
    id: v.string(),
    ownerId: v.string(),
    ownerType: v.union(v.literal("USER"), v.literal("TEAM")),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("DELETED")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_owner", ["ownerId", "ownerType"])
    .index("by_owner_name", ["ownerId", "ownerType", "name"]),

  secrets: defineTable({
    id: v.string(),
    projectId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("KV"),
      v.literal("ENV_FILE"),
      v.literal("NOTE"),
      v.literal("JSON")
    ),
    description: v.optional(v.string()),
    currentVersionId: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("DELETED")),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_name", ["projectId", "name"])
    .index("by_creator", ["createdBy"]),

  secretVersions: defineTable({
    id: v.string(),
    secretId: v.string(),
    versionNumber: v.number(),
    encryptedValue: v.string(),
    encryptedKey: v.string(),
    iv: v.string(),
    createdBy: v.string(),
    createdAt: v.string(),
  })
    .index("by_secret", ["secretId"])
    .index("by_secret_version", ["secretId", "versionNumber"]),

  teams: defineTable({
    id: v.string(),
    name: v.string(),
    slug: v.string(),
    createdBy: v.string(),
    encryptedTeamKey: v.string(), // JSON-serialized Record<string, string>
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_creator", ["createdBy"]),

  teamMembers: defineTable({
    id: v.string(),
    teamId: v.string(),
    userId: v.optional(v.string()),
    invitedEmail: v.string(),
    invitedBy: v.string(),
    role: v.union(
      v.literal("OWNER"),
      v.literal("EDITOR"),
      v.literal("VIEWER")
    ),
    status: v.union(
      v.literal("PENDING"),
      v.literal("ACCEPTED"),
      v.literal("DECLINED"),
      v.literal("EXPIRED")
    ),
    invitedAt: v.string(),
    respondedAt: v.optional(v.string()),
    expiresAt: v.string(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_user", ["teamId", "userId"])
    .index("by_team_email", ["teamId", "invitedEmail"])
    .index("by_email", ["invitedEmail"]),

  shareLinks: defineTable({
    id: v.string(),
    secretId: v.string(),
    secretVersionId: v.string(),
    createdBy: v.string(),
    mode: v.union(
      v.literal("TIME_LIMITED"),
      v.literal("RECIPIENT_LOCKED")
    ),
    encryptedPayload: v.string(),
    recipientPublicKey: v.optional(v.string()),
    maxViews: v.optional(v.number()),
    viewCount: v.number(),
    expiresAt: v.string(),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("EXPIRED"),
      v.literal("EXHAUSTED"),
      v.literal("REVOKED")
    ),
    createdAt: v.string(),
  })
    .index("by_secret", ["secretId"])
    .index("by_creator", ["createdBy"])
    .index("by_status", ["status"]),

  shareLinkAccesses: defineTable({
    id: v.string(),
    shareLinkId: v.string(),
    accessedAt: v.string(),
    ipHash: v.optional(v.string()),
  }).index("by_share_link", ["shareLinkId"]),
});
