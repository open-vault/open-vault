// Shared entity types matching the spec exactly

export type OwnerType = "USER" | "TEAM";
export type SecretType = "KV" | "ENV_FILE" | "NOTE" | "JSON";
export type ShareLinkMode = "TIME_LIMITED" | "RECIPIENT_LOCKED";
export type TeamRole = "OWNER" | "EDITOR" | "VIEWER";

export type ProjectStatus = "ACTIVE" | "DELETED";
export type SecretStatus = "ACTIVE" | "DELETED";
export type ShareLinkStatus = "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "REVOKED";
export type TeamMemberStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export interface User {
  id: string;
  sshPublicKeyFingerprint: string;
  sshPublicKey: string;
  email: string | null;
  displayName: string | null;
  createdAt: string; // RFC3339 UTC ms
  updatedAt: string;
}

export interface Project {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Secret {
  id: string;
  projectId: string;
  createdBy: string;
  name: string;
  type: SecretType;
  description: string | null;
  currentVersionId: string | null;
  status: SecretStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SecretVersion {
  id: string;
  secretId: string;
  versionNumber: number;
  encryptedValue: string;
  encryptedKey: string;
  iv: string;
  createdBy: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  encryptedTeamKey: Record<string, string>; // { userId: base64url(ageEncryptedKey) }
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string | null;
  invitedEmail: string;
  invitedBy: string;
  role: TeamRole;
  status: TeamMemberStatus;
  invitedAt: string;
  respondedAt: string | null;
  expiresAt: string;
}

export interface ShareLink {
  id: string;
  secretId: string;
  secretVersionId: string;
  createdBy: string;
  mode: ShareLinkMode;
  // encryptedPayload omitted from list responses
  recipientPublicKey: string | null;
  maxViews: number | null;
  viewCount: number;
  expiresAt: string;
  status: ShareLinkStatus;
  createdAt: string;
}

export interface ShareLinkWithPayload extends ShareLink {
  encryptedPayload: string;
}

export interface ShareLinkAccess {
  id: string;
  shareLinkId: string;
  accessedAt: string;
  ipHash: string | null;
}
