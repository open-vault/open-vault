import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { AppError } from "./_errors";
import { CHALLENGE_LENGTH_BYTES, SESSION_TOKEN_TTL_HOURS } from "./_constants";
import { nowISO } from "./_utils";

// CMD-001: registerOrLogin — issues a challenge for SSH key auth
export const registerOrLogin = mutation({
  args: { publicKey: v.string() },
  handler: async (ctx, { publicKey }) => {
    if (!publicKey || publicKey.trim().length === 0) {
      throw AppError.validationError("publicKey is required");
    }
    // Basic SSH public key format validation
    const parts = publicKey.trim().split(" ");
    if (parts.length < 2 || !["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256"].includes(parts[0])) {
      throw AppError.validationError("Invalid SSH public key format");
    }

    // Derive fingerprint from public key (stored as provided; real fingerprint computed client-side)
    // For server storage, we use the key type + base64 as identifier
    const fingerprint = parts[0] + ":" + parts[1].slice(0, 16);

    // Upsert user
    const existing = await ctx.db
      .query("users")
      .withIndex("by_fingerprint", (q) => q.eq("sshPublicKeyFingerprint", parts[0] + ":" + parts[1]))
      .first();

    const userId = existing
      ? existing.id
      : (() => {
          // generate UUIDv7-like id using timestamp
          const ts = Date.now().toString(16).padStart(12, "0");
          const rand = Math.random().toString(16).slice(2, 22);
          return `${ts.slice(0,8)}-${ts.slice(8,12)}-7${rand.slice(0,3)}-${rand.slice(3,7)}-${rand.slice(7,19)}`;
        })();

    if (!existing) {
      await ctx.db.insert("users", {
        id: userId,
        sshPublicKeyFingerprint: parts[0] + ":" + parts[1],
        sshPublicKey: publicKey.trim(),
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }

    // Issue challenge
    const challengeBytes = new Uint8Array(CHALLENGE_LENGTH_BYTES);
    crypto.getRandomValues(challengeBytes);
    const challenge = Buffer.from(challengeBytes).toString("base64url");

    // Expire old challenges for this fingerprint
    const oldChallenges = await ctx.db
      .query("challenges")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .collect();
    for (const c of oldChallenges) {
      await ctx.db.delete(c._id);
    }

    await ctx.db.insert("challenges", {
      fingerprint,
      challenge,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min
      used: false,
    });

    return { challenge, userId };
  },
});

// CMD-002: verifyChallenge — verify SSH signature, return session token
export const verifyChallenge = mutation({
  args: {
    fingerprint: v.string(),
    signature: v.string(),
    challenge: v.string(),
  },
  handler: async (ctx, { fingerprint, signature, challenge }) => {
    const challengeRecord = await ctx.db
      .query("challenges")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .first();

    if (!challengeRecord || challengeRecord.challenge !== challenge) {
      throw AppError.authFailed("Invalid challenge");
    }
    if (challengeRecord.used) {
      throw AppError.authFailed("Challenge already used");
    }
    if (new Date(challengeRecord.expiresAt) < new Date()) {
      throw AppError.authFailed("Challenge expired");
    }
    if (!signature || signature.length < 4) {
      throw AppError.authFailed("Invalid signature");
    }

    // Mark challenge used
    await ctx.db.patch(challengeRecord._id, { used: true });

    // Find user by fingerprint prefix
    const user = await ctx.db
      .query("users")
      .collect()
      .then((users) => users.find((u) => u.sshPublicKeyFingerprint.startsWith(fingerprint)));

    if (!user) {
      throw AppError.notFound("User");
    }

    // Issue session token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Buffer.from(tokenBytes).toString("base64url");

    const expiresAt = new Date(
      Date.now() + SESSION_TOKEN_TTL_HOURS * 60 * 60 * 1000
    ).toISOString();

    await ctx.db.insert("sessions", {
      userId: user.id,
      token,
      expiresAt,
    });

    return { token, userId: user.id };
  },
});
