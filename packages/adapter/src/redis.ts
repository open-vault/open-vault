/**
 * Redis adapter. Stores vault data in Redis using hash and sorted-set structures.
 *
 * Key layout:
 *   {prefix}:users:{fingerprint}            → JSON hash
 *   {prefix}:users:by-id:{userId}           → fingerprint (lookup)
 *   {prefix}:projects:{projectId}           → JSON hash
 *   {prefix}:projects:by-owner:{userId}     → sorted set of projectIds
 *   {prefix}:secrets:{secretId}             → JSON hash
 *   {prefix}:secrets:by-project:{projectId} → sorted set of secretIds
 *   {prefix}:versions:{secretId}:{versionId}→ JSON hash
 *   {prefix}:versions:by-secret:{secretId}  → sorted set (score=versionNumber)
 *   {prefix}:teams:{teamId}                 → JSON hash
 *   {prefix}:members:{memberId}             → JSON hash
 *   {prefix}:members:by-team:{teamId}       → sorted set of memberIds
 *   {prefix}:links:{linkId}                 → JSON hash
 *   {prefix}:links:by-secret:{secretId}     → sorted set of linkIds
 *
 * Auth: Redis auth/ACL gates access. SSH fingerprint identifies the vault user.
 *
 * Requires: `ioredis` package  (bun add ioredis)
 */
import { AppError } from "@open-vault/errors";
import type {
  VaultAdapter,
  AuthParams,
  AuthResult,
  VaultUser,
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

export interface RedisAdapterConfig {
  /** Redis connection URL: redis://user:pass@host:6379 */
  redisUrl: string;
  /** Optional key prefix (default: "ov") */
  keyPrefix?: string;
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function now(): string {
  return new Date().toISOString();
}

export class RedisAdapter implements VaultAdapter {
  readonly type = "redis";
  private config: RedisAdapterConfig;
  private prefix: string;
  private _client: unknown | null = null;

  constructor(config: RedisAdapterConfig) {
    this.config = config;
    this.prefix = config.keyPrefix ?? "ov";
  }

  private k(...parts: string[]): string {
    return [this.prefix, ...parts].join(":");
  }

  private async client() {
    if (this._client) return this._client as {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
      del(...keys: string[]): Promise<number>;
      zadd(key: string, score: number, member: string): Promise<unknown>;
      zrem(key: string, member: string): Promise<unknown>;
      zrevrange(key: string, start: number, stop: number): Promise<string[]>;
      zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
    };
    const { default: Redis } = await import("ioredis").catch(() => {
      throw new AppError("internal_error", "ioredis is required for the Redis adapter. Run: bun add ioredis");
    });
    const client = new Redis(this.config.redisUrl);
    this._client = client;
    return client as {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<unknown>;
      del(...keys: string[]): Promise<number>;
      zadd(key: string, score: number, member: string): Promise<unknown>;
      zrem(key: string, member: string): Promise<unknown>;
      zrevrange(key: string, start: number, stop: number): Promise<string[]>;
      zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
    };
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const r = await this.client();
    const raw = await r.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  private async setJson(key: string, value: unknown): Promise<void> {
    const r = await this.client();
    await r.set(key, JSON.stringify(value));
  }

  async authenticate(params: AuthParams): Promise<AuthResult> {
    const userKey = this.k("users", params.fingerprint);
    let user = await this.getJson<VaultUser>(userKey);
    if (!user) {
      user = {
        id: generateId(),
        sshPublicKeyFingerprint: params.fingerprint,
        sshPublicKey: params.publicKey,
        createdAt: now(),
        updatedAt: now(),
      };
      await this.setJson(userKey, user);
      const r = await this.client();
      await r.set(this.k("users", "by-id", user.id), params.fingerprint);
    }
    const token = Buffer.from(`${params.fingerprint}:${generateId()}`).toString("base64url");
    return { userId: user.id, token, expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString() };
  }

  async listProjects(userId: string): Promise<VaultProject[]> {
    const r = await this.client();
    const ids = await r.zrevrange(this.k("projects", "by-owner", userId), 0, -1);
    const projects = await Promise.all(ids.map((id) => this.getJson<VaultProject>(this.k("projects", id))));
    return (projects.filter(Boolean) as VaultProject[]).filter((p) => p.status === "ACTIVE");
  }

  async createProject(userId: string, input: CreateProjectInput): Promise<VaultProject> {
    const r = await this.client();
    const id = generateId();
    const ownerId = input.ownerType === "TEAM" && input.teamId ? input.teamId : userId;
    const ts = now();
    const project: VaultProject = {
      id, ownerId, ownerType: input.ownerType ?? "USER",
      name: input.name, description: input.description,
      status: "ACTIVE", createdAt: ts, updatedAt: ts,
    };
    await this.setJson(this.k("projects", id), project);
    await r.zadd(this.k("projects", "by-owner", ownerId), Date.now(), id);
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    const project = await this.getJson<VaultProject>(this.k("projects", projectId));
    if (!project) throw AppError.notFound("Project");
    await this.setJson(this.k("projects", projectId), { ...project, status: "DELETED", updatedAt: now() });
  }

  async listSecrets(projectId: string, type?: SecretType): Promise<VaultSecret[]> {
    const r = await this.client();
    const ids = await r.zrevrange(this.k("secrets", "by-project", projectId), 0, -1);
    const secrets = await Promise.all(ids.map((id) => this.getJson<VaultSecret>(this.k("secrets", id))));
    return (secrets.filter(Boolean) as VaultSecret[])
      .filter((s) => s.status === "ACTIVE" && (!type || s.type === type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSecret(secretId: string): Promise<{ secret: VaultSecret; version: VaultSecretVersion }> {
    const secret = await this.getJson<VaultSecret>(this.k("secrets", secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (!secret.currentVersionId) throw AppError.notFound("SecretVersion");
    const version = await this.getJson<VaultSecretVersion>(this.k("versions", secretId, secret.currentVersionId));
    if (!version) throw AppError.notFound("SecretVersion");
    return { secret, version };
  }

  async createSecret(projectId: string, createdBy: string, input: CreateSecretInput): Promise<VaultSecret> {
    const r = await this.client();
    const secretId = generateId();
    const versionId = generateId();
    const ts = now();
    const version: VaultSecretVersion = {
      id: versionId, secretId, versionNumber: 1,
      encryptedValue: input.encryptedValue, encryptedKey: input.encryptedKey, iv: input.iv,
      createdBy, createdAt: ts,
    };
    const secret: VaultSecret = {
      id: secretId, projectId, createdBy, name: input.name, type: input.type,
      description: input.description, currentVersionId: versionId,
      status: "ACTIVE", createdAt: ts, updatedAt: ts,
    };
    await this.setJson(this.k("versions", secretId, versionId), version);
    await r.zadd(this.k("versions", "by-secret", secretId), 1, versionId);
    await this.setJson(this.k("secrets", secretId), secret);
    await r.zadd(this.k("secrets", "by-project", projectId), Date.now(), secretId);
    return secret;
  }

  async updateSecret(secretId: string, createdBy: string, input: UpdateSecretInput): Promise<VaultSecret> {
    const r = await this.client();
    const secret = await this.getJson<VaultSecret>(this.k("secrets", secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    const versions = await this.listSecretVersions(secretId);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const versionId = generateId();
    const ts = now();
    const version: VaultSecretVersion = {
      id: versionId, secretId, versionNumber: nextVersion,
      encryptedValue: input.encryptedValue, encryptedKey: input.encryptedKey, iv: input.iv,
      createdBy, createdAt: ts,
    };
    await this.setJson(this.k("versions", secretId, versionId), version);
    await r.zadd(this.k("versions", "by-secret", secretId), nextVersion, versionId);
    const updated = { ...secret, currentVersionId: versionId, updatedAt: ts };
    await this.setJson(this.k("secrets", secretId), updated);
    return updated;
  }

  async deleteSecret(secretId: string): Promise<void> {
    const secret = await this.getJson<VaultSecret>(this.k("secrets", secretId));
    if (!secret) throw AppError.notFound("Secret");
    await this.setJson(this.k("secrets", secretId), { ...secret, status: "DELETED", updatedAt: now() });
  }

  async listSecretVersions(secretId: string): Promise<VaultSecretVersion[]> {
    const r = await this.client();
    const ids = await r.zrevrange(this.k("versions", "by-secret", secretId), 0, -1);
    const versions = await Promise.all(ids.map((id) => this.getJson<VaultSecretVersion>(this.k("versions", secretId, id))));
    return (versions.filter(Boolean) as VaultSecretVersion[]).sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async rollbackSecret(secretId: string, targetVersionId: string, createdBy: string): Promise<VaultSecretVersion> {
    const r = await this.client();
    const secret = await this.getJson<VaultSecret>(this.k("secrets", secretId));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    const target = await this.getJson<VaultSecretVersion>(this.k("versions", secretId, targetVersionId));
    if (!target) throw AppError.notFound("SecretVersion");
    const versions = await this.listSecretVersions(secretId);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const newVersionId = generateId();
    const ts = now();
    const newVersion: VaultSecretVersion = {
      id: newVersionId, secretId, versionNumber: nextVersion,
      encryptedValue: target.encryptedValue, encryptedKey: target.encryptedKey, iv: target.iv,
      createdBy, createdAt: ts,
    };
    await this.setJson(this.k("versions", secretId, newVersionId), newVersion);
    await r.zadd(this.k("versions", "by-secret", secretId), nextVersion, newVersionId);
    await this.setJson(this.k("secrets", secretId), { ...secret, currentVersionId: newVersionId, updatedAt: ts });
    return newVersion;
  }

  async batchCreateSecrets(projectId: string, createdBy: string, secrets: CreateSecretInput[]): Promise<void> {
    await Promise.all(secrets.map((s) => this.createSecret(projectId, createdBy, s)));
  }

  async listSecretsForExport(projectId: string): Promise<ExportSecret[]> {
    const secrets = await this.listSecrets(projectId);
    return Promise.all(secrets.map(async (s) => {
      const { version } = await this.getSecret(s.id);
      return { id: s.id, name: s.name, type: s.type, encryptedValue: version.encryptedValue, encryptedKey: version.encryptedKey, iv: version.iv };
    }));
  }

  async searchSecrets(projectId: string, query: string): Promise<VaultSecret[]> {
    const secrets = await this.listSecrets(projectId);
    const q = query.toLowerCase();
    return secrets.filter((s) => s.name.toLowerCase().includes(q));
  }

  async createTeam(userId: string, name: string, encryptedTeamKey: string): Promise<VaultTeam> {
    const r = await this.client();
    const id = generateId();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const ts = now();
    const team: VaultTeam = { id, name, slug, createdBy: userId, encryptedTeamKey, createdAt: ts, updatedAt: ts };
    await this.setJson(this.k("teams", id), team);
    const memberId = generateId();
    const ownerMember: VaultTeamMember = {
      id: memberId, teamId: id, userId, invitedEmail: "", invitedBy: userId,
      role: "OWNER", status: "ACCEPTED",
      invitedAt: ts, respondedAt: ts,
      expiresAt: new Date(Date.now() + 365 * 24 * 3600000).toISOString(),
    };
    await this.setJson(this.k("members", memberId), ownerMember);
    await r.zadd(this.k("members", "by-team", id), Date.now(), memberId);
    return team;
  }

  async inviteTeamMember(teamId: string, input: InviteInput): Promise<VaultTeamMember> {
    const r = await this.client();
    const id = generateId();
    const ts = now();
    const member: VaultTeamMember = {
      id, teamId, invitedEmail: input.invitedEmail, invitedBy: input.invitedBy,
      role: input.role, status: "PENDING",
      invitedAt: ts,
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    };
    await this.setJson(this.k("members", id), member);
    await r.zadd(this.k("members", "by-team", teamId), Date.now(), id);
    return member;
  }

  async respondToInvite(memberId: string, accept: boolean): Promise<void> {
    const member = await this.getJson<VaultTeamMember>(this.k("members", memberId));
    if (!member) throw AppError.notFound("TeamMember");
    await this.setJson(this.k("members", memberId), { ...member, status: accept ? "ACCEPTED" : "DECLINED", respondedAt: now() });
  }

  async listTeamMembers(teamId: string): Promise<VaultTeamMember[]> {
    const r = await this.client();
    const ids = await r.zrevrange(this.k("members", "by-team", teamId), 0, -1);
    const members = await Promise.all(ids.map((id) => this.getJson<VaultTeamMember>(this.k("members", id))));
    return members.filter(Boolean) as VaultTeamMember[];
  }

  async setTeamMemberRole(memberId: string, role: TeamRole): Promise<void> {
    const member = await this.getJson<VaultTeamMember>(this.k("members", memberId));
    if (!member) throw AppError.notFound("TeamMember");
    await this.setJson(this.k("members", memberId), { ...member, role });
  }

  async removeTeamMember(memberId: string): Promise<void> {
    const member = await this.getJson<VaultTeamMember>(this.k("members", memberId));
    if (!member) throw AppError.notFound("TeamMember");
    const r = await this.client();
    await r.del(this.k("members", memberId));
    await r.zrem(this.k("members", "by-team", member.teamId), memberId);
  }

  async createShareLink(input: CreateShareLinkInput): Promise<VaultShareLink> {
    const r = await this.client();
    const id = generateId();
    const ts = now();
    const link: VaultShareLink = {
      id, secretId: input.secretId, secretVersionId: input.secretVersionId,
      createdBy: input.createdBy, mode: input.mode,
      encryptedPayload: input.encryptedPayload, recipientPublicKey: input.recipientPublicKey,
      maxViews: input.maxViews, viewCount: 0,
      expiresAt: input.expiresAt, status: "ACTIVE", createdAt: ts,
    };
    await this.setJson(this.k("links", id), link);
    await r.zadd(this.k("links", "by-secret", input.secretId), Date.now(), id);
    return link;
  }

  async accessShareLink(linkId: string): Promise<{ encryptedPayload: string; mode: ShareLinkMode }> {
    const link = await this.getJson<VaultShareLink>(this.k("links", linkId));
    if (!link) throw AppError.notFound("ShareLink");
    if (link.status === "REVOKED") throw AppError.shareLinkRevoked();
    if (link.status === "EXPIRED" || new Date(link.expiresAt) < new Date()) throw AppError.shareLinkExpired();
    if (link.status === "EXHAUSTED") throw AppError.shareLinkExhausted();
    const newCount = link.viewCount + 1;
    const newStatus = link.maxViews && newCount >= link.maxViews ? "EXHAUSTED" : "ACTIVE";
    await this.setJson(this.k("links", linkId), { ...link, viewCount: newCount, status: newStatus });
    return { encryptedPayload: link.encryptedPayload, mode: link.mode };
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const link = await this.getJson<VaultShareLink>(this.k("links", linkId));
    if (!link) throw AppError.notFound("ShareLink");
    await this.setJson(this.k("links", linkId), { ...link, status: "REVOKED" });
  }

  async listShareLinks(secretId: string): Promise<VaultShareLink[]> {
    const r = await this.client();
    const ids = await r.zrevrange(this.k("links", "by-secret", secretId), 0, -1);
    const links = await Promise.all(ids.map((id) => this.getJson<VaultShareLink>(this.k("links", id))));
    return (links.filter(Boolean) as VaultShareLink[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
