export type SecretType = "KV" | "ENV_FILE" | "NOTE" | "JSON";
export type OwnerType = "USER" | "TEAM";
export type ProjectStatus = "ACTIVE" | "DELETED";
export type SecretStatus = "ACTIVE" | "DELETED";
export type TeamRole = "OWNER" | "EDITOR" | "VIEWER";
export type TeamMemberStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
export type ShareLinkMode = "TIME_LIMITED" | "VIEW_LIMITED" | "RECIPIENT_LOCKED";
export type ShareLinkStatus = "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "REVOKED";

export interface VaultUser {
  id: string;
  sshPublicKeyFingerprint: string;
  sshPublicKey: string;
  email?: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultProject {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VaultEnvironment {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultSecret {
  id: string;
  projectId: string;
  environmentId: string;
  createdBy: string;
  name: string;
  type: SecretType;
  description?: string;
  currentVersionId?: string;
  status: SecretStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VaultSecretVersion {
  id: string;
  secretId: string;
  versionNumber: number;
  encryptedValue: string;
  encryptedKey: string;
  iv: string;
  createdBy: string;
  createdAt: string;
}

export interface VaultTeam {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  encryptedTeamKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultTeamMember {
  id: string;
  teamId: string;
  userId?: string;
  invitedEmail: string;
  invitedBy: string;
  role: TeamRole;
  status: TeamMemberStatus;
  invitedAt: string;
  respondedAt?: string;
  expiresAt: string;
}

export interface VaultShareLink {
  id: string;
  secretId: string;
  secretVersionId: string;
  createdBy: string;
  mode: ShareLinkMode;
  encryptedPayload: string;
  recipientPublicKey?: string;
  maxViews?: number;
  viewCount: number;
  expiresAt: string;
  status: ShareLinkStatus;
  createdAt: string;
}

export interface AuthResult {
  userId: string;
  token: string;
  expiresAt: string;
}

export interface AuthParams {
  publicKey: string;
  fingerprint: string;
  /** Challenge-signing function. Required for Convex; ignored by S3/Local. */
  sign?: (challenge: string) => Promise<string>;
}

export interface CreateProjectInput {
  name: string;
  ownerType?: OwnerType;
  teamId?: string;
  description?: string;
}

export interface CreateSecretInput {
  name: string;
  type: SecretType;
  encryptedValue: string;
  encryptedKey: string;
  iv: string;
  description?: string;
}

export interface UpdateSecretInput {
  encryptedValue: string;
  encryptedKey: string;
  iv: string;
}

export interface InviteInput {
  invitedEmail: string;
  role: TeamRole;
  invitedBy: string;
}

export interface CreateShareLinkInput {
  secretId: string;
  secretVersionId: string;
  createdBy: string;
  mode: ShareLinkMode;
  encryptedPayload: string;
  expiresAt: string;
  maxViews?: number;
  recipientPublicKey?: string;
}

export interface ExportSecret {
  id: string;
  name: string;
  type: SecretType;
  encryptedValue: string;
  encryptedKey: string;
  iv: string;
}

export interface VaultAdapter {
  readonly type: string;

  authenticate(params: AuthParams): Promise<AuthResult>;

  // Projects
  listProjects(userId: string): Promise<VaultProject[]>;
  createProject(userId: string, input: CreateProjectInput): Promise<VaultProject>;
  deleteProject(projectId: string): Promise<void>;

  // Environments
  listEnvironments(projectId: string): Promise<VaultEnvironment[]>;
  createEnvironment(projectId: string, name: string): Promise<VaultEnvironment>;
  deleteEnvironment(environmentId: string): Promise<void>;

  // Secrets
  listSecrets(projectId: string, environmentId: string, type?: SecretType): Promise<VaultSecret[]>;
  getSecret(secretId: string): Promise<{ secret: VaultSecret; version: VaultSecretVersion }>;
  createSecret(projectId: string, environmentId: string, createdBy: string, input: CreateSecretInput): Promise<VaultSecret>;
  updateSecret(secretId: string, createdBy: string, input: UpdateSecretInput): Promise<VaultSecret>;
  deleteSecret(secretId: string): Promise<void>;
  listSecretVersions(secretId: string): Promise<VaultSecretVersion[]>;
  rollbackSecret(secretId: string, targetVersionId: string, createdBy: string): Promise<VaultSecretVersion>;
  batchCreateSecrets(projectId: string, environmentId: string, createdBy: string, secrets: CreateSecretInput[]): Promise<void>;
  listSecretsForExport(projectId: string, environmentId: string): Promise<ExportSecret[]>;
  searchSecrets(projectId: string, environmentId: string, query: string): Promise<VaultSecret[]>;

  // Teams
  createTeam(userId: string, name: string, encryptedTeamKey: string): Promise<VaultTeam>;
  inviteTeamMember(teamId: string, input: InviteInput): Promise<VaultTeamMember>;
  respondToInvite(memberId: string, accept: boolean): Promise<void>;
  listTeamMembers(teamId: string): Promise<VaultTeamMember[]>;
  setTeamMemberRole(memberId: string, role: TeamRole): Promise<void>;
  removeTeamMember(memberId: string): Promise<void>;

  // Share Links
  createShareLink(input: CreateShareLinkInput): Promise<VaultShareLink>;
  accessShareLink(linkId: string): Promise<{ encryptedPayload: string; mode: ShareLinkMode }>;
  revokeShareLink(linkId: string): Promise<void>;
  listShareLinks(secretId: string): Promise<VaultShareLink[]>;
}
