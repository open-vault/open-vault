import { z } from "zod";
import {
  PROJECT_NAME_REGEX,
  SECRET_NAME_KV_REGEX,
  SECRET_NAME_OTHER_REGEX,
  TEAM_SLUG_REGEX,
  SHARE_LINK_MAX_EXPIRY_DAYS,
} from "@open-vault/constants";

// Auth
export const RegisterOrLoginSchema = z.object({
  publicKey: z.string().min(1, "publicKey required"),
});

export const VerifyChallengeSchema = z.object({
  fingerprint: z.string().min(1),
  signature: z.string().min(1),
  challenge: z.string().min(1),
});

// Projects
export const CreateProjectSchema = z.object({
  name: z
    .string()
    .regex(PROJECT_NAME_REGEX, "Invalid project name"),
  ownerType: z.enum(["USER", "TEAM"]),
  teamId: z.string().optional(),
  description: z.string().optional(),
});

// Secrets
export const CreateSecretSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["KV", "ENV_FILE", "NOTE", "JSON"]),
    encryptedValue: z.string().min(1),
    encryptedKey: z.string().min(1),
    iv: z.string().min(1),
    description: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const valid =
      val.type === "KV"
        ? SECRET_NAME_KV_REGEX.test(val.name)
        : SECRET_NAME_OTHER_REGEX.test(val.name);
    if (!valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message:
          val.type === "KV"
            ? "KV secret name must match /^[A-Z][A-Z0-9_]{0,254}$/"
            : "Secret name must match /^[a-z][a-z0-9_-]{0,127}$/",
      });
    }
  });

export const UpdateSecretSchema = z.object({
  secretId: z.string().min(1),
  encryptedValue: z.string().min(1),
  encryptedKey: z.string().min(1),
  iv: z.string().min(1),
});

// Share links
const maxExpiryMs = SHARE_LINK_MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export const CreateShareLinkSchema = z
  .object({
    secretId: z.string().min(1),
    mode: z.enum(["TIME_LIMITED", "RECIPIENT_LOCKED"]),
    encryptedPayload: z.string().min(1),
    expiresAt: z
      .string()
      .refine((s) => {
        const t = new Date(s).getTime();
        const now = Date.now();
        return t > now && t - now <= maxExpiryMs;
      }, "expiresAt must be in the future and within 30 days"),
    maxViews: z.number().int().positive().optional(),
    recipientPublicKey: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "RECIPIENT_LOCKED" && !val.recipientPublicKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recipientPublicKey"],
        message: "recipientPublicKey required for RECIPIENT_LOCKED mode",
      });
    }
  });

// Teams
export const CreateTeamSchema = z.object({
  name: z.string().regex(TEAM_SLUG_REGEX, "Invalid team name"),
});

export const InviteTeamMemberSchema = z.object({
  teamId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["OWNER", "EDITOR", "VIEWER"]),
});

export const RespondToInvitationSchema = z.object({
  teamMemberId: z.string().min(1),
  response: z.enum(["ACCEPT", "DECLINE"]),
});
