import { query } from "./_generated/server";
import { AppError } from "./_errors";
import { requireAuth } from "./_utils";

// CMD-003: users.me
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .collect()
      .then((u) => u.find((x) => x.id === userId));
    if (!user) throw AppError.notFound("User");
    const { _id, _creationTime, ...rest } = user;
    return rest;
  },
});
