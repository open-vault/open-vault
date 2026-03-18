/**
 * Local filesystem adapter. Stores all vault data in a directory tree.
 * Useful for development, offline use, or self-hosted single-machine setups.
 *
 * Storage layout (under rootDir):
 *   users/{fingerprint}.json
 *   projects/{projectId}.json
 *   environments/{environmentId}.json
 *   secrets/{secretId}.json
 *   secret-versions/{secretId}/{versionId}.json
 *   teams/{teamId}.json
 *   team-members/{memberId}.json
 *   share-links/{linkId}.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
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

export interface LocalAdapterConfig {
  /** Root directory for vault storage. Defaults to ~/.open-vault/vault */
  rootDir?: string;
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function now(): string {
  return new Date().toISOString();
}

export class LocalAdapter implements VaultAdapter {
  readonly type = "local";
  private rootDir: string;

  constructor(config: LocalAdapterConfig = {}) {
    this.rootDir = config.rootDir ?? join(homedir(), ".open-vault", "vault");
  }

  private path(...parts: string[]): string {
    return join(this.rootDir, ...parts);
  }

  private read<T>(filePath: string): T | null {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  }

  private write(filePath: string, value: unknown): void {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(value, null, 2), { mode: 0o600 });
  }

  private remove(filePath: string): void {
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  private readDir<T>(dir: string): T[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.read<T>(join(dir, f))!)
      .filter(Boolean);
  }

  private readDirRecursive<T>(dir: string): T[] {
    if (!existsSync(dir)) return [];
    const results: T[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        results.push(...this.readDirRecursive<T>(join(dir, entry.name)));
      } else if (entry.name.endsWith(".json")) {
        const val = this.read<T>(join(dir, entry.name));
        if (val) results.push(val);
      }
    }
    return results;
  }

  async authenticate(params: AuthParams): Promise<AuthResult> {
    const fingerprint = params.fingerprint;
    const userPath = this.path("users", `${fingerprint}.json`);
    let user = this.read<VaultUser>(userPath);
    if (!user) {
      user = {
        id: generateId(),
        sshPublicKeyFingerprint: fingerprint,
        sshPublicKey: params.publicKey,
        createdAt: now(),
        updatedAt: now(),
      };
      this.write(userPath, user);
    }
    const token = Buffer.from(`${fingerprint}:${generateId()}`).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600000).toISOString();
    return { userId: user.id, token, expiresAt };
  }

  async listProjects(userId: string): Promise<VaultProject[]> {
    return this.readDir<VaultProject>(this.path("projects")).filter(
      (p) => p.ownerId === userId && p.status === "ACTIVE"
    );
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
    this.write(this.path("projects", `${project.id}.json`), project);
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    const filePath = this.path("projects", `${projectId}.json`);
    const project = this.read<VaultProject>(filePath);
    if (!project) throw AppError.notFound("Project");
    this.write(filePath, { ...project, status: "DELETED", updatedAt: now() });
  }

  async listEnvironments(projectId: string): Promise<VaultEnvironment[]> {
    return this.readDir<VaultEnvironment>(this.path("environments")).filter(
      (e) => e.projectId === projectId
    );
  }

  async createEnvironment(projectId: string, name: string): Promise<VaultEnvironment> {
    const env: VaultEnvironment = {
      id: generateId(),
      projectId,
      name,
      createdAt: now(),
      updatedAt: now(),
    };
    this.write(this.path("environments", `${env.id}.json`), env);
    return env;
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    this.remove(this.path("environments", `${environmentId}.json`));
  }

  async listSecrets(projectId: string, environmentId: string, type?: SecretType): Promise<VaultSecret[]> {
    return this.readDir<VaultSecret>(this.path("secrets"))
      .filter((s) => s.projectId === projectId && s.environmentId === environmentId && s.status === "ACTIVE" && (!type || s.type === type))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSecret(secretId: string): Promise<{ secret: VaultSecret; version: VaultSecretVersion }> {
    const secret = this.read<VaultSecret>(this.path("secrets", `${secretId}.json`));
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    if (!secret.currentVersionId) throw AppError.notFound("SecretVersion");
    const version = this.read<VaultSecretVersion>(
      this.path("secret-versions", secretId, `${secret.currentVersionId}.json`)
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
    this.write(this.path("secret-versions", secretId, `${versionId}.json`), version);
    this.write(this.path("secrets", `${secretId}.json`), secret);
    return secret;
  }

  async updateSecret(secretId: string, createdBy: string, input: UpdateSecretInput): Promise<VaultSecret> {
    const filePath = this.path("secrets", `${secretId}.json`);
    const secret = this.read<VaultSecret>(filePath);
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
    this.write(this.path("secret-versions", secretId, `${versionId}.json`), version);
    this.write(filePath, updated);
    return updated;
  }

  async deleteSecret(secretId: string): Promise<void> {
    const filePath = this.path("secrets", `${secretId}.json`);
    const secret = this.read<VaultSecret>(filePath);
    if (!secret) throw AppError.notFound("Secret");
    this.write(filePath, { ...secret, status: "DELETED", updatedAt: now() });
  }

  async listSecretVersions(secretId: string): Promise<VaultSecretVersion[]> {
    return this.readDir<VaultSecretVersion>(this.path("secret-versions", secretId))
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async rollbackSecret(secretId: string, targetVersionId: string, createdBy: string): Promise<VaultSecretVersion> {
    const filePath = this.path("secrets", `${secretId}.json`);
    const secret = this.read<VaultSecret>(filePath);
    if (!secret || secret.status === "DELETED") throw AppError.notFound("Secret");
    const target = this.read<VaultSecretVersion>(
      this.path("secret-versions", secretId, `${targetVersionId}.json`)
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
    this.write(this.path("secret-versions", secretId, `${newVersionId}.json`), newVersion);
    this.write(filePath, { ...secret, currentVersionId: newVersionId, updatedAt: now() });
    return newVersion;
  }

  async batchCreateSecrets(projectId: string, environmentId: string, createdBy: string, secrets: CreateSecretInput[]): Promise<void> {
    for (const s of secrets) await this.createSecret(projectId, environmentId, createdBy, s);
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
    this.write(this.path("teams", `${team.id}.json`), team);
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
    this.write(this.path("team-members", `${ownerMember.id}.json`), ownerMember);
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
    this.write(this.path("team-members", `${member.id}.json`), member);
    return member;
  }

  async respondToInvite(memberId: string, accept: boolean): Promise<void> {
    const filePath = this.path("team-members", `${memberId}.json`);
    const member = this.read<VaultTeamMember>(filePath);
    if (!member) throw AppError.notFound("TeamMember");
    this.write(filePath, {
      ...member,
      status: accept ? "ACCEPTED" : "DECLINED",
      respondedAt: now(),
    });
  }

  async listTeamMembers(teamId: string): Promise<VaultTeamMember[]> {
    return this.readDir<VaultTeamMember>(this.path("team-members")).filter(
      (m) => m.teamId === teamId
    );
  }

  async setTeamMemberRole(memberId: string, role: TeamRole): Promise<void> {
    const filePath = this.path("team-members", `${memberId}.json`);
    const member = this.read<VaultTeamMember>(filePath);
    if (!member) throw AppError.notFound("TeamMember");
    this.write(filePath, { ...member, role });
  }

  async removeTeamMember(memberId: string): Promise<void> {
    this.remove(this.path("team-members", `${memberId}.json`));
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
    this.write(this.path("share-links", `${link.id}.json`), link);
    return link;
  }

  async accessShareLink(linkId: string): Promise<{ encryptedPayload: string; mode: ShareLinkMode }> {
    const filePath = this.path("share-links", `${linkId}.json`);
    const link = this.read<VaultShareLink>(filePath);
    const notFound = () => new AppError("not_found", "Share link does not exist or may have expired");
    if (!link) throw notFound();
    if (link.status === "REVOKED") throw AppError.shareLinkRevoked();
    if (link.mode !== "VIEW_LIMITED" && (link.status === "EXPIRED" || new Date(link.expiresAt) < new Date())) throw notFound();
    if (link.status === "EXHAUSTED") throw AppError.shareLinkExhausted();
    const newCount = link.viewCount + 1;
    const newStatus = link.maxViews && newCount >= link.maxViews ? "EXHAUSTED" : "ACTIVE";
    this.write(filePath, { ...link, viewCount: newCount, status: newStatus });
    return { encryptedPayload: link.encryptedPayload, mode: link.mode };
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const filePath = this.path("share-links", `${linkId}.json`);
    const link = this.read<VaultShareLink>(filePath);
    if (!link) throw AppError.notFound("ShareLink");
    this.write(filePath, { ...link, status: "REVOKED" });
  }

  async listShareLinks(secretId: string): Promise<VaultShareLink[]> {
    return this.readDir<VaultShareLink>(this.path("share-links"))
      .filter((l) => l.secretId === secretId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
