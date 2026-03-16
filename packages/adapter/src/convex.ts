import { AppError } from "@open-vault/errors";
import type {
  VaultAdapter,
  AuthParams,
  AuthResult,
  VaultProject,
  VaultSecret,
  VaultSecretVersion,
  VaultTeam,
  VaultTeamMember,
  VaultShareLink,
  CreateProjectInput,
  CreateSecretInput,
  UpdateSecretInput,
  InviteInput,
  CreateShareLinkInput,
  ExportSecret,
  SecretType,
  TeamRole,
  ShareLinkMode,
} from "./types.js";

export interface ConvexAdapterConfig {
  convexUrl: string;
}

export class ConvexAdapter implements VaultAdapter {
  readonly type = "convex";
  private convexUrl: string;
  private token: string | null = null;

  constructor(config: ConvexAdapterConfig) {
    this.convexUrl = config.convexUrl;
  }

  private async getClient() {
    const { ConvexHttpClient } = await import("convex/browser");
    const client = new ConvexHttpClient(this.convexUrl);
    if (this.token) client.setAuth(this.token);
    return client;
  }

  setToken(token: string) {
    this.token = token;
  }

  async authenticate(params: AuthParams): Promise<AuthResult> {
    if (!params.sign) throw new AppError("auth_failed", "Convex adapter requires a sign function");
    const client = await this.getClient();
    const { challenge, userId } = await client.mutation("auth:registerOrLogin", {
      publicKey: params.publicKey,
    });
    const signature = await params.sign(challenge);
    const { token } = await client.mutation("auth:verifyChallenge", {
      fingerprint: params.fingerprint,
      signature,
      challenge,
    });
    this.token = token;
    const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    return { userId, token, expiresAt };
  }

  async listProjects(_userId: string): Promise<VaultProject[]> {
    const client = await this.getClient();
    return client.query("projects:list", {});
  }

  async createProject(_userId: string, input: CreateProjectInput): Promise<VaultProject> {
    const client = await this.getClient();
    return client.mutation("projects:create", {
      name: input.name,
      ownerType: input.ownerType ?? "USER",
      teamId: input.teamId,
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const client = await this.getClient();
    await client.mutation("projects:del", { projectId });
  }

  async listSecrets(projectId: string, type?: SecretType): Promise<VaultSecret[]> {
    const client = await this.getClient();
    return client.query("secrets:list", { projectId, type });
  }

  async getSecret(secretId: string): Promise<{ secret: VaultSecret; version: VaultSecretVersion }> {
    const client = await this.getClient();
    return client.query("secrets:get", { secretId });
  }

  async createSecret(projectId: string, _createdBy: string, input: CreateSecretInput): Promise<VaultSecret> {
    const client = await this.getClient();
    return client.mutation("secrets:create", {
      projectId,
      name: input.name,
      type: input.type,
      encryptedValue: input.encryptedValue,
      encryptedKey: input.encryptedKey,
      iv: input.iv,
      description: input.description,
    });
  }

  async updateSecret(secretId: string, _createdBy: string, input: UpdateSecretInput): Promise<VaultSecret> {
    const client = await this.getClient();
    return client.mutation("secrets:update", {
      secretId,
      encryptedValue: input.encryptedValue,
      encryptedKey: input.encryptedKey,
      iv: input.iv,
    });
  }

  async deleteSecret(secretId: string): Promise<void> {
    const client = await this.getClient();
    await client.mutation("secrets:del", { secretId });
  }

  async listSecretVersions(secretId: string): Promise<VaultSecretVersion[]> {
    const client = await this.getClient();
    return client.query("secrets:listVersions", { secretId });
  }

  async rollbackSecret(secretId: string, targetVersionId: string, _createdBy: string): Promise<VaultSecretVersion> {
    const client = await this.getClient();
    return client.mutation("secrets:rollback", { secretId, targetVersionId });
  }

  async batchCreateSecrets(projectId: string, _createdBy: string, secrets: CreateSecretInput[]): Promise<void> {
    const client = await this.getClient();
    await client.mutation("secrets:batchCreate", { projectId, secrets });
  }

  async listSecretsForExport(projectId: string): Promise<ExportSecret[]> {
    const client = await this.getClient();
    return client.query("secrets:listForExport", { projectId });
  }

  async searchSecrets(projectId: string, query: string): Promise<VaultSecret[]> {
    const client = await this.getClient();
    return client.query("secrets:search", { projectId, query });
  }

  async createTeam(_userId: string, name: string, encryptedTeamKey: string): Promise<VaultTeam> {
    const client = await this.getClient();
    return client.mutation("teams:create", { name, encryptedTeamKey });
  }

  async inviteTeamMember(teamId: string, input: InviteInput): Promise<VaultTeamMember> {
    const client = await this.getClient();
    return client.mutation("teams:invite", {
      teamId,
      invitedEmail: input.invitedEmail,
      role: input.role,
    });
  }

  async respondToInvite(memberId: string, accept: boolean): Promise<void> {
    const client = await this.getClient();
    await client.mutation("teams:respond", { memberId, accept });
  }

  async listTeamMembers(teamId: string): Promise<VaultTeamMember[]> {
    const client = await this.getClient();
    return client.query("teams:listMembers", { teamId });
  }

  async setTeamMemberRole(memberId: string, role: TeamRole): Promise<void> {
    const client = await this.getClient();
    await client.mutation("teams:setRole", { memberId, role });
  }

  async removeTeamMember(memberId: string): Promise<void> {
    const client = await this.getClient();
    await client.mutation("teams:removeMember", { memberId });
  }

  async createShareLink(input: CreateShareLinkInput): Promise<VaultShareLink> {
    const client = await this.getClient();
    return client.mutation("shareLinks:create", {
      secretId: input.secretId,
      mode: input.mode,
      encryptedPayload: input.encryptedPayload,
      expiresAt: input.expiresAt,
      maxViews: input.maxViews,
      recipientPublicKey: input.recipientPublicKey,
    });
  }

  async accessShareLink(linkId: string): Promise<{ encryptedPayload: string; mode: ShareLinkMode }> {
    const client = await this.getClient();
    return client.mutation("shareLinks:access", { shareLinkId: linkId });
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const client = await this.getClient();
    await client.mutation("shareLinks:revoke", { shareLinkId: linkId });
  }

  async listShareLinks(secretId: string): Promise<VaultShareLink[]> {
    const client = await this.getClient();
    return client.query("shareLinks:list", { secretId });
  }
}
