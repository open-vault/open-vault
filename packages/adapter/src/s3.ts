/**
 * S3-compatible adapter. Works with AWS S3 and Cloudflare R2 (set endpoint for R2).
 *
 * Storage layout (all keys under optional prefix):
 *   users/{fingerprint}.json
 *   projects/{projectId}.json
 *   environments/{environmentId}.json
 *   secrets/{secretId}.json
 *   secret-versions/{secretId}/{versionId}.json
 *   teams/{teamId}.json
 *   team-members/{memberId}.json
 *   share-links/{linkId}.json
 *
 * Auth: AWS/R2 credentials gate bucket access. SSH fingerprint identifies the vault user.
 * No challenge-response needed — credential possession proves identity.
 */
import { AppError } from "@open-vault/errors";
import type {
  VaultAdapter,
  AuthParams,
  AuthResult,
  VaultUser,
  VaultProject,
  VaultEnvironment,
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

export interface S3AdapterConfig {
  bucket: string;
  region?: string;
  /** Custom endpoint for R2: https://{account-id}.r2.cloudflarestorage.com */
  endpoint?: string;
  /** Optional key prefix (e.g. "vault/") */
  prefix?: string;
  /** AWS credentials. Defaults to env vars / ~/.aws/credentials */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function now(): string {
  return new Date().toISOString();
}

export class S3Adapter implements VaultAdapter {
  readonly type: string;
  private config: S3AdapterConfig;
  private prefix: string;

  constructor(config: S3AdapterConfig, type = "s3") {
    this.config = config;
    this.prefix = config.prefix ?? "";
    this.type = type;
  }

  private key(...parts: string[]): string {
    return this.prefix + parts.join("/");
  }

  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3").catch(() => {
      throw new AppError("internal_error", "@aws-sdk/client-s3 is required for the S3/R2 adapter. Run: bun add @aws-sdk/client-s3");
    });
    return new S3Client({
      region: this.config.region ?? "auto",
      endpoint: this.config.endpoint,
      credentials: this.config.credentials,
      forcePathStyle: !!this.config.endpoint, // required for R2 and any custom endpoint
    });
  }

  private async get<T>(key: string): Promise<T | null> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      const body = await res.Body!.transformToString();
      return JSON.parse(body) as T;
    } catch (e: unknown) {
      const err = e as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number }; message?: string };
if (
        err.name === "NoSuchKey" ||
        err.Code === "NoSuchKey" ||
        err.$metadata?.httpStatusCode === 404
      ) return null;
      throw e;
    }
  }

  private async put(key: string, value: unknown, expiresAt?: Date): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json",
      ...(expiresAt ? { Expires: expiresAt } : {}),
    }));
  }

  private async del(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = await this.client();
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: this.prefix + prefix,
        ContinuationToken: continuationToken,
      }));
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);
    return keys;
  }

  private async listAll<T>(prefix: string): Promise<T[]> {
    const keys = await this.listKeys(prefix);
    return Promise.all(keys.map(async (k) => {
      const val = await this.get<T>(k);
      return val!;
    }));
  }

  async authenticate(params: AuthParams): Promise<AuthResult> {
    const fingerprint = params.fingerprint;
    const userKey = this.key("users", `${fingerprint}.json`);
    let user = await this.get<VaultUser>(userKey);
    if (!user) {
      user = {
        id: generateId(),
        sshPublicKeyFingerprint: fingerprint,
        sshPublicKey: params.publicKey,
        createdAt: now(),
        updatedAt: now(),
      };
      await this.put(userKey, user);
    }
    const token = Buffer.from(`${fingerprint}:${generateId()}`).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600000).toISOString();
    return { userId: user.id, token, expiresAt };
  }

  async listProjects(userId: string): Promise<VaultProject[]> {
    const all = await this.listAll<VaultProject>("projects/");
    return all.filter((p) => p.ownerId === userId && p.status === "ACTIVE");
  }

  async createProject(userId: string, input: CreateProjectInput): Promise<VaultProject> {
    const project: VaultProject = {
      id: generateId(),
      ownerId: input.ownerType === "TEAM" && input.teamId ? input.teamId : userId,
      ownerType: input.ownerType ?? "USER",
      name: input.name,
      description: input.description,
      status: "ACTIVE",
      createdAt: now(),
      updatedAt: now(),
    };
    await this.put(this.key("projects", `${project.id}.json`), project);
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    const key = this.key("projects", `${projectId}.json`);
    const project = await this.get<VaultProject>(key);
    if (!project) throw AppError.notFound("Project");
    await this.put(key, { ...project, status: "DELETED", updatedAt: now() });
  }

  async listEnvironments(projectId: string): Promise<VaultEnvironment[]> {
    const all = await this.listAll<VaultEnvironment>("environments/");
    return all.filter((e) => e.projectId === projectId);
  }

  async createEnvironment(projectId: string, name: string): Promise<VaultEnvironment> {
    const env: VaultEnvironment = {
      id: generateId(),
      projectId,
      name,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.put(this.key("environments", `${env.id}.json`), env);
    return env;
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    await this.del(this.key("environments", `${environmentId}.json`));
  }

  async listSecrets(projectId: string, environmentId: string, type?: SecretType): Promise<VaultSecret[]> {
    const all = await this.listAll<VaultSecret>("secrets/");
    return all.filter(
      (s) => s.projectId === projectId && s.environmentId === environmentId && s.status === "ACTIVE" && (!type || s.type === type)
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSecret(secretId: string): Promise<{ secret: VaultSecret; version: VaultSecretVersion }> {
    const secret = await this.get<VaultSecret>(this.key("secrets", `${secretId}.json`));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (!secret.currentVersionId) throw AppError.notFound("SecretVersion");
    const version = await this.get<VaultSecretVersion>(
      this.key("secret-versions", secretId, `${secret.currentVersionId}.json`)
    );
    if (!version) throw AppError.notFound("SecretVersion");
    return { secret, version };
  }

  async createSecret(projectId: string, environmentId: string, createdBy: string, input: CreateSecretInput): Promise<VaultSecret> {
    const secretId = generateId();
    const versionId = generateId();
    const version: VaultSecretVersion = {
      id: versionId,
      secretId,
      versionNumber: 1,
      encryptedValue: input.encryptedValue,
      encryptedKey: input.encryptedKey,
      iv: input.iv,
      createdBy,
      createdAt: now(),
    };
    const secret: VaultSecret = {
      id: secretId,
      projectId,
      environmentId,
      createdBy,
      name: input.name,
      type: input.type,
      description: input.description,
      currentVersionId: versionId,
      status: "ACTIVE",
      createdAt: now(),
      updatedAt: now(),
    };
    await this.put(this.key("secret-versions", secretId, `${versionId}.json`), version);
    await this.put(this.key("secrets", `${secretId}.json`), secret);
    return secret;
  }

  async updateSecret(secretId: string, createdBy: string, input: UpdateSecretInput): Promise<VaultSecret> {
    const secret = await this.get<VaultSecret>(this.key("secrets", `${secretId}.json`));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    const versions = await this.listSecretVersions(secretId);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const versionId = generateId();
    const version: VaultSecretVersion = {
      id: versionId,
      secretId,
      versionNumber: nextVersion,
      encryptedValue: input.encryptedValue,
      encryptedKey: input.encryptedKey,
      iv: input.iv,
      createdBy,
      createdAt: now(),
    };
    const updated = { ...secret, currentVersionId: versionId, updatedAt: now() };
    await this.put(this.key("secret-versions", secretId, `${versionId}.json`), version);
    await this.put(this.key("secrets", `${secretId}.json`), updated);
    return updated;
  }

  async deleteSecret(secretId: string): Promise<void> {
    const key = this.key("secrets", `${secretId}.json`);
    const secret = await this.get<VaultSecret>(key);
    if (!secret) throw AppError.notFound("Secret");
    await this.put(key, { ...secret, status: "DELETED", updatedAt: now() });
  }

  async listSecretVersions(secretId: string): Promise<VaultSecretVersion[]> {
    const all = await this.listAll<VaultSecretVersion>(`secret-versions/${secretId}/`);
    return all.sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async rollbackSecret(secretId: string, targetVersionId: string, createdBy: string): Promise<VaultSecretVersion> {
    const secret = await this.get<VaultSecret>(this.key("secrets", `${secretId}.json`));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    const target = await this.get<VaultSecretVersion>(
      this.key("secret-versions", secretId, `${targetVersionId}.json`)
    );
    if (!target) throw AppError.notFound("SecretVersion");
    const versions = await this.listSecretVersions(secretId);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const newVersionId = generateId();
    const newVersion: VaultSecretVersion = {
      id: newVersionId,
      secretId,
      versionNumber: nextVersion,
      encryptedValue: target.encryptedValue,
      encryptedKey: target.encryptedKey,
      iv: target.iv,
      createdBy,
      createdAt: now(),
    };
    await this.put(this.key("secret-versions", secretId, `${newVersionId}.json`), newVersion);
    await this.put(this.key("secrets", `${secretId}.json`), {
      ...secret,
      currentVersionId: newVersionId,
      updatedAt: now(),
    });
    return newVersion;
  }

  async batchCreateSecrets(projectId: string, environmentId: string, createdBy: string, secrets: CreateSecretInput[]): Promise<void> {
    await Promise.all(secrets.map((s) => this.createSecret(projectId, environmentId, createdBy, s)));
  }

  async listSecretsForExport(projectId: string, environmentId: string): Promise<ExportSecret[]> {
    const secrets = await this.listSecrets(projectId, environmentId);
    return Promise.all(secrets.map(async (s) => {
      const { version } = await this.getSecret(s.id);
      return {
        id: s.id,
        name: s.name,
        type: s.type,
        encryptedValue: version.encryptedValue,
        encryptedKey: version.encryptedKey,
        iv: version.iv,
      };
    }));
  }

  async searchSecrets(projectId: string, environmentId: string, query: string): Promise<VaultSecret[]> {
    const secrets = await this.listSecrets(projectId, environmentId);
    const q = query.toLowerCase();
    return secrets.filter((s) => s.name.toLowerCase().includes(q));
  }

  async createTeam(userId: string, name: string, encryptedTeamKey: string): Promise<VaultTeam> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const team: VaultTeam = {
      id: generateId(),
      name,
      slug,
      createdBy: userId,
      encryptedTeamKey,
      createdAt: now(),
      updatedAt: now(),
    };
    await this.put(this.key("teams", `${team.id}.json`), team);
    const ownerMember: VaultTeamMember = {
      id: generateId(),
      teamId: team.id,
      userId,
      invitedEmail: "",
      invitedBy: userId,
      role: "OWNER",
      status: "ACCEPTED",
      invitedAt: now(),
      respondedAt: now(),
      expiresAt: new Date(Date.now() + 365 * 24 * 3600000).toISOString(),
    };
    await this.put(this.key("team-members", `${ownerMember.id}.json`), ownerMember);
    return team;
  }

  async inviteTeamMember(teamId: string, input: InviteInput): Promise<VaultTeamMember> {
    const member: VaultTeamMember = {
      id: generateId(),
      teamId,
      invitedEmail: input.invitedEmail,
      invitedBy: input.invitedBy,
      role: input.role,
      status: "PENDING",
      invitedAt: now(),
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    };
    await this.put(this.key("team-members", `${member.id}.json`), member);
    return member;
  }

  async respondToInvite(memberId: string, accept: boolean): Promise<void> {
    const key = this.key("team-members", `${memberId}.json`);
    const member = await this.get<VaultTeamMember>(key);
    if (!member) throw AppError.notFound("TeamMember");
    await this.put(key, {
      ...member,
      status: accept ? "ACCEPTED" : "DECLINED",
      respondedAt: now(),
    });
  }

  async listTeamMembers(teamId: string): Promise<VaultTeamMember[]> {
    const all = await this.listAll<VaultTeamMember>("team-members/");
    return all.filter((m) => m.teamId === teamId);
  }

  async setTeamMemberRole(memberId: string, role: TeamRole): Promise<void> {
    const key = this.key("team-members", `${memberId}.json`);
    const member = await this.get<VaultTeamMember>(key);
    if (!member) throw AppError.notFound("TeamMember");
    await this.put(key, { ...member, role });
  }

  async removeTeamMember(memberId: string): Promise<void> {
    await this.del(this.key("team-members", `${memberId}.json`));
  }

  async createShareLink(input: CreateShareLinkInput): Promise<VaultShareLink> {
    const link: VaultShareLink = {
      id: generateId(),
      secretId: input.secretId,
      secretVersionId: input.secretVersionId,
      createdBy: input.createdBy,
      mode: input.mode,
      encryptedPayload: input.encryptedPayload,
      recipientPublicKey: input.recipientPublicKey,
      maxViews: input.maxViews,
      viewCount: 0,
      expiresAt: input.expiresAt,
      status: "ACTIVE",
      createdAt: now(),
    };
    await this.put(this.key("share-links", `${link.id}.json`), link, new Date(input.expiresAt));
    return link;
  }

  async accessShareLink(linkId: string): Promise<{ encryptedPayload: string; mode: ShareLinkMode }> {
    const key = this.key("share-links", `${linkId}.json`);
    const link = await this.get<VaultShareLink>(key);
    const notFound = () => new AppError("not_found", "Share link does not exist or may have expired");
    if (!link) throw notFound();
    if (link.status === "REVOKED") throw AppError.shareLinkRevoked();
    if (link.mode !== "VIEW_LIMITED" && (link.status === "EXPIRED" || new Date(link.expiresAt) < new Date())) throw notFound();
    if (link.status === "EXHAUSTED") throw AppError.shareLinkExhausted();
    const newCount = link.viewCount + 1;
    const newStatus = link.maxViews && newCount >= link.maxViews ? "EXHAUSTED" : "ACTIVE";
    await this.put(key, { ...link, viewCount: newCount, status: newStatus });
    return { encryptedPayload: link.encryptedPayload, mode: link.mode };
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const key = this.key("share-links", `${linkId}.json`);
    const link = await this.get<VaultShareLink>(key);
    if (!link) throw AppError.notFound("ShareLink");
    await this.put(key, { ...link, status: "REVOKED" });
  }

  async listShareLinks(secretId: string): Promise<VaultShareLink[]> {
    const all = await this.listAll<VaultShareLink>("share-links/");
    return all
      .filter((l) => l.secretId === secretId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
