import { QueryCtx, MutationCtx } from "./_generated/server";
import { AppError } from "./_errors";

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = ctx.auth ? await ctx.auth.getUserIdentity() : null;
  // Session-based auth: look up session by token from identity subject
  if (!identity) {
    throw AppError.unauthenticated();
  }
  // The session token is passed as the tokenIdentifier subject
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", identity.subject))
    .first();
  if (!session || new Date(session.expiresAt) < new Date()) {
    throw AppError.unauthenticated();
  }
  return session.userId;
}

export function nowISO(): string {
  return new Date().toISOString();
}
