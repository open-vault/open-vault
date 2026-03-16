/**
 * MySQL adapter. Stores vault data in a MySQL/MariaDB database.
 *
 * Schema is created automatically on first use (DDL idempotent via IF NOT EXISTS).
 *
 * Tables:
 *   ov_users, ov_projects, ov_environments, ov_secrets, ov_secret_versions,
 *   ov_teams, ov_team_members, ov_share_links
 *
 * Auth: MySQL credentials gate database access. SSH fingerprint identifies
 * the vault user; no challenge-response needed.
 *
 * Requires: `mysql2` package  (bun add mysql2)
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

export interface MySQLAdapterConfig {
  /** MySQL connection URL: mysql://user:pass@host:3306/db */
  databaseUrl: string;
  /** Optional table prefix (default: "ov_") */
  tablePrefix?: string;
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function now(): string {
  return new Date().toISOString();
}

export class MySQLAdapter implements VaultAdapter {
  readonly type = "mysql";
  private config: MySQLAdapterConfig;
  private prefix: string;
  private _pool: unknown | null = null;

  constructor(config: MySQLAdapterConfig) {
    this.config = config;
    this.prefix = config.tablePrefix ?? "ov_";
  }

  private t(name: string): string {
    return `${this.prefix}${name}`;
  }

  private async pool() {
    if (this._pool) return this._pool as { execute: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown]> };
    const mysql2 = await import("mysql2/promise").catch(() => {
      throw new AppError("internal_error", "mysql2 is required for the MySQL adapter. Run: bun add mysql2");
    });
    const pool = mysql2.createPool(this.config.databaseUrl);
    this._pool = pool;
    await this.migrate(pool as { execute: (sql: string) => Promise<unknown> });
    return pool as { execute: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown]> };
  }

  private async migrate(pool: { execute: (sql: string) => Promise<unknown> }): Promise<void> {
    const p = this.prefix;
    const stmts = [
      `CREATE TABLE IF NOT EXISTS ${p}users (
        id VARCHAR(40) PRIMARY KEY,
        fingerprint VARCHAR(255) NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        email VARCHAR(255),
        display_name VARCHAR(255),
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}projects (
        id VARCHAR(40) PRIMARY KEY,
        owner_id VARCHAR(40) NOT NULL,
        owner_type VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}environments (
        id VARCHAR(40) PRIMARY KEY,
        project_id VARCHAR(40) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}secrets (
        id VARCHAR(40) PRIMARY KEY,
        project_id VARCHAR(40) NOT NULL,
        environment_id VARCHAR(40) NOT NULL DEFAULT 'default',
        created_by VARCHAR(40) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(20) NOT NULL,
        description TEXT,
        current_version_id VARCHAR(40),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}secret_versions (
        id VARCHAR(40) PRIMARY KEY,
        secret_id VARCHAR(40) NOT NULL,
        version_number INT NOT NULL,
        encrypted_value TEXT NOT NULL,
        encrypted_key TEXT NOT NULL,
        iv VARCHAR(255) NOT NULL,
        created_by VARCHAR(40) NOT NULL,
        created_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}teams (
        id VARCHAR(40) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        created_by VARCHAR(40) NOT NULL,
        encrypted_team_key TEXT NOT NULL,
        created_at VARCHAR(64) NOT NULL,
        updated_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}team_members (
        id VARCHAR(40) PRIMARY KEY,
        team_id VARCHAR(40) NOT NULL,
        user_id VARCHAR(40),
        invited_email VARCHAR(255) NOT NULL,
        invited_by VARCHAR(40) NOT NULL,
        role VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        invited_at VARCHAR(64) NOT NULL,
        responded_at VARCHAR(64),
        expires_at VARCHAR(64) NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${p}share_links (
        id VARCHAR(40) PRIMARY KEY,
        secret_id VARCHAR(40) NOT NULL,
        secret_version_id VARCHAR(40) NOT NULL,
        created_by VARCHAR(40) NOT NULL,
        mode VARCHAR(30) NOT NULL,
        encrypted_payload TEXT NOT NULL,
        recipient_public_key TEXT,
        max_views INT,
        view_count INT NOT NULL DEFAULT 0,
        expires_at VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at VARCHAR(64) NOT NULL
      )`,
    ];
    for (const stmt of stmts) {
      await pool.execute(stmt);
    }
  }

  private async q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = await this.pool();
    const [rows] = await pool.execute(sql, params);
    return rows as T[];
  }

  async authenticate(params: AuthParams): Promise<AuthResult> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("users")} WHERE fingerprint = ?`, [params.fingerprint]);
    let user: VaultUser;
    if (rows.length === 0) {
      const id = generateId();
      const ts = now();
      await this.q(`INSERT INTO ${this.t("users")} (id, fingerprint, public_key, created_at, updated_at) VALUES (?,?,?,?,?)`, [id, params.fingerprint, params.publicKey, ts, ts]);
      user = { id, sshPublicKeyFingerprint: params.fingerprint, sshPublicKey: params.publicKey, createdAt: ts, updatedAt: ts };
    } else {
      const r = rows[0];
      user = { id: r.id, sshPublicKeyFingerprint: r.fingerprint, sshPublicKey: r.public_key, email: r.email, displayName: r.display_name, createdAt: r.created_at, updatedAt: r.updated_at };
    }
    const token = Buffer.from(`${params.fingerprint}:${generateId()}`).toString("base64url");
    return { userId: user.id, token, expiresAt: new Date(Date.now() + 30 * 24 * 3600000).toISOString() };
  }

  async listProjects(userId: string): Promise<VaultProject[]> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("projects")} WHERE owner_id=? AND status='ACTIVE' ORDER BY name`, [userId]);
    return rows.map(this.rowToProject);
  }

  async createProject(userId: string, input: CreateProjectInput): Promise<VaultProject> {
    const id = generateId();
    const ownerId = input.ownerType === "TEAM" && input.teamId ? input.teamId : userId;
    const ts = now();
    await this.q(`INSERT INTO ${this.t("projects")} (id, owner_id, owner_type, name, description, status, created_at, updated_at) VALUES (?,?,?,?,?,'ACTIVE',?,?)`, [id, ownerId, input.ownerType ?? "USER", input.name, input.description ?? null, ts, ts]);
    return this.rowToProject({ id, owner_id: ownerId, owner_type: input.ownerType ?? "USER", name: input.name, description: input.description ?? "", status: "ACTIVE", created_at: ts, updated_at: ts });
  }

  async deleteProject(projectId: string): Promise<void> {
    const rows = await this.q<Record<string, string>>(`SELECT id FROM ${this.t("projects")} WHERE id=?`, [projectId]);
    if (!rows.length) throw AppError.notFound("Project");
    await this.q(`UPDATE ${this.t("projects")} SET status='DELETED', updated_at=? WHERE id=?`, [now(), projectId]);
  }

  async listEnvironments(projectId: string): Promise<VaultEnvironment[]> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("environments")} WHERE project_id=? ORDER BY name`, [projectId]);
    return rows.map(this.rowToEnvironment);
  }

  async createEnvironment(projectId: string, name: string): Promise<VaultEnvironment> {
    const id = generateId();
    const ts = now();
    await this.q(`INSERT INTO ${this.t("environments")} (id, project_id, name, created_at, updated_at) VALUES (?,?,?,?,?)`, [id, projectId, name, ts, ts]);
    return this.rowToEnvironment({ id, project_id: projectId, name, created_at: ts, updated_at: ts });
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    await this.q(`DELETE FROM ${this.t("environments")} WHERE id=?`, [environmentId]);
  }

  async listSecrets(projectId: string, environmentId: string, type?: SecretType): Promise<VaultSecret[]> {
    const rows = type
      ? await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secrets")} WHERE project_id=? AND environment_id=? AND status='ACTIVE' AND type=? ORDER BY name`, [projectId, environmentId, type])
      : await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secrets")} WHERE project_id=? AND environment_id=? AND status='ACTIVE' ORDER BY name`, [projectId, environmentId]);
    return rows.map(this.rowToSecret);
  }

  async getSecret(secretId: string): Promise<{ secret: VaultSecret; version: VaultSecretVersion }> {
    const [s] = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secrets")} WHERE id=? AND status='ACTIVE'`, [secretId]);
    if (!s) throw AppError.notFound("Secret");
    const [v] = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secret_versions")} WHERE id=?`, [s.current_version_id]);
    if (!v) throw AppError.notFound("SecretVersion");
    return { secret: this.rowToSecret(s), version: this.rowToVersion(v) };
  }

  async createSecret(projectId: string, environmentId: string, createdBy: string, input: CreateSecretInput): Promise<VaultSecret> {
    const secretId = generateId();
    const versionId = generateId();
    const ts = now();
    await this.q(`INSERT INTO ${this.t("secret_versions")} (id, secret_id, version_number, encrypted_value, encrypted_key, iv, created_by, created_at) VALUES (?,?,1,?,?,?,?,?)`, [versionId, secretId, input.encryptedValue, input.encryptedKey, input.iv, createdBy, ts]);
    await this.q(`INSERT INTO ${this.t("secrets")} (id, project_id, environment_id, created_by, name, type, description, current_version_id, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'ACTIVE',?,?)`, [secretId, projectId, environmentId, createdBy, input.name, input.type, input.description ?? null, versionId, ts, ts]);
    return this.rowToSecret({ id: secretId, project_id: projectId, environment_id: environmentId, created_by: createdBy, name: input.name, type: input.type, description: input.description ?? "", current_version_id: versionId, status: "ACTIVE", created_at: ts, updated_at: ts });
  }

  async updateSecret(secretId: string, createdBy: string, input: UpdateSecretInput): Promise<VaultSecret> {
    const [s] = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secrets")} WHERE id=? AND status='ACTIVE'`, [secretId]);
    if (!s) throw AppError.notFound("Secret");
    const versions = await this.listSecretVersions(secretId);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const versionId = generateId();
    const ts = now();
    await this.q(`INSERT INTO ${this.t("secret_versions")} (id, secret_id, version_number, encrypted_value, encrypted_key, iv, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)`, [versionId, secretId, nextVersion, input.encryptedValue, input.encryptedKey, input.iv, createdBy, ts]);
    await this.q(`UPDATE ${this.t("secrets")} SET current_version_id=?, updated_at=? WHERE id=?`, [versionId, ts, secretId]);
    return this.rowToSecret({ ...s, current_version_id: versionId, updated_at: ts });
  }

  async deleteSecret(secretId: string): Promise<void> {
    const [s] = await this.q<Record<string, string>>(`SELECT id FROM ${this.t("secrets")} WHERE id=?`, [secretId]);
    if (!s) throw AppError.notFound("Secret");
    await this.q(`UPDATE ${this.t("secrets")} SET status='DELETED', updated_at=? WHERE id=?`, [now(), secretId]);
  }

  async listSecretVersions(secretId: string): Promise<VaultSecretVersion[]> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secret_versions")} WHERE secret_id=? ORDER BY version_number DESC`, [secretId]);
    return rows.map(this.rowToVersion);
  }

  async rollbackSecret(secretId: string, targetVersionId: string, createdBy: string): Promise<VaultSecretVersion> {
    const [s] = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secrets")} WHERE id=? AND status='ACTIVE'`, [secretId]);
    if (!s) throw AppError.notFound("Secret");
    const [target] = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secret_versions")} WHERE id=?`, [targetVersionId]);
    if (!target) throw AppError.notFound("SecretVersion");
    const versions = await this.listSecretVersions(secretId);
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1;
    const newVersionId = generateId();
    const ts = now();
    await this.q(`INSERT INTO ${this.t("secret_versions")} (id, secret_id, version_number, encrypted_value, encrypted_key, iv, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)`, [newVersionId, secretId, nextVersion, target.encrypted_value, target.encrypted_key, target.iv, createdBy, ts]);
    await this.q(`UPDATE ${this.t("secrets")} SET current_version_id=?, updated_at=? WHERE id=?`, [newVersionId, ts, secretId]);
    return this.rowToVersion({ id: newVersionId, secret_id: secretId, version_number: String(nextVersion), encrypted_value: target.encrypted_value, encrypted_key: target.encrypted_key, iv: target.iv, created_by: createdBy, created_at: ts });
  }

  async batchCreateSecrets(projectId: string, environmentId: string, createdBy: string, secrets: CreateSecretInput[]): Promise<void> {
    await Promise.all(secrets.map((s) => this.createSecret(projectId, environmentId, createdBy, s)));
  }

  async listSecretsForExport(projectId: string, environmentId: string): Promise<ExportSecret[]> {
    const secrets = await this.listSecrets(projectId, environmentId);
    return Promise.all(secrets.map(async (s) => {
      const { version } = await this.getSecret(s.id);
      return { id: s.id, name: s.name, type: s.type, encryptedValue: version.encryptedValue, encryptedKey: version.encryptedKey, iv: version.iv };
    }));
  }

  async searchSecrets(projectId: string, environmentId: string, query: string): Promise<VaultSecret[]> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("secrets")} WHERE project_id=? AND environment_id=? AND status='ACTIVE' AND name LIKE ? ORDER BY name`, [projectId, environmentId, `%${query}%`]);
    return rows.map(this.rowToSecret);
  }

  async createTeam(userId: string, name: string, encryptedTeamKey: string): Promise<VaultTeam> {
    const id = generateId();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const ts = now();
    await this.q(`INSERT INTO ${this.t("teams")} (id, name, slug, created_by, encrypted_team_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`, [id, name, slug, userId, encryptedTeamKey, ts, ts]);
    const memberId = generateId();
    const memberExpiry = new Date(Date.now() + 365 * 24 * 3600000).toISOString();
    await this.q(`INSERT INTO ${this.t("team_members")} (id, team_id, user_id, invited_email, invited_by, role, status, invited_at, responded_at, expires_at) VALUES (?,?,?,'',?,'OWNER','ACCEPTED',?,?,?)`, [memberId, id, userId, userId, ts, ts, memberExpiry]);
    return { id, name, slug, createdBy: userId, encryptedTeamKey, createdAt: ts, updatedAt: ts };
  }

  async inviteTeamMember(teamId: string, input: InviteInput): Promise<VaultTeamMember> {
    const id = generateId();
    const ts = now();
    const expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
    await this.q(`INSERT INTO ${this.t("team_members")} (id, team_id, invited_email, invited_by, role, status, invited_at, expires_at) VALUES (?,?,?,?,?,'PENDING',?,?)`, [id, teamId, input.invitedEmail, input.invitedBy, input.role, ts, expiresAt]);
    return { id, teamId, invitedEmail: input.invitedEmail, invitedBy: input.invitedBy, role: input.role, status: "PENDING", invitedAt: ts, expiresAt };
  }

  async respondToInvite(memberId: string, accept: boolean): Promise<void> {
    const [m] = await this.q<Record<string, string>>(`SELECT id FROM ${this.t("team_members")} WHERE id=?`, [memberId]);
    if (!m) throw AppError.notFound("TeamMember");
    await this.q(`UPDATE ${this.t("team_members")} SET status=?, responded_at=? WHERE id=?`, [accept ? "ACCEPTED" : "DECLINED", now(), memberId]);
  }

  async listTeamMembers(teamId: string): Promise<VaultTeamMember[]> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("team_members")} WHERE team_id=?`, [teamId]);
    return rows.map(this.rowToMember);
  }

  async setTeamMemberRole(memberId: string, role: TeamRole): Promise<void> {
    const [m] = await this.q<Record<string, string>>(`SELECT id FROM ${this.t("team_members")} WHERE id=?`, [memberId]);
    if (!m) throw AppError.notFound("TeamMember");
    await this.q(`UPDATE ${this.t("team_members")} SET role=? WHERE id=?`, [role, memberId]);
  }

  async removeTeamMember(memberId: string): Promise<void> {
    await this.q(`DELETE FROM ${this.t("team_members")} WHERE id=?`, [memberId]);
  }

  async createShareLink(input: CreateShareLinkInput): Promise<VaultShareLink> {
    const id = generateId();
    const ts = now();
    await this.q(`INSERT INTO ${this.t("share_links")} (id, secret_id, secret_version_id, created_by, mode, encrypted_payload, recipient_public_key, max_views, view_count, expires_at, status, created_at) VALUES (?,?,?,?,?,?,?,?,0,?,'ACTIVE',?)`, [id, input.secretId, input.secretVersionId, input.createdBy, input.mode, input.encryptedPayload, input.recipientPublicKey ?? null, input.maxViews ?? null, input.expiresAt, ts]);
    return { id, secretId: input.secretId, secretVersionId: input.secretVersionId, createdBy: input.createdBy, mode: input.mode, encryptedPayload: input.encryptedPayload, recipientPublicKey: input.recipientPublicKey, maxViews: input.maxViews, viewCount: 0, expiresAt: input.expiresAt, status: "ACTIVE", createdAt: ts };
  }

  async accessShareLink(linkId: string): Promise<{ encryptedPayload: string; mode: ShareLinkMode }> {
    const [link] = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("share_links")} WHERE id=?`, [linkId]);
    if (!link) throw AppError.notFound("ShareLink");
    if (link.status === "REVOKED") throw AppError.shareLinkRevoked();
    if (link.status === "EXPIRED" || new Date(link.expires_at) < new Date()) throw AppError.shareLinkExpired();
    if (link.status === "EXHAUSTED") throw AppError.shareLinkExhausted();
    const newCount = Number(link.view_count) + 1;
    const newStatus = link.max_views && newCount >= Number(link.max_views) ? "EXHAUSTED" : "ACTIVE";
    await this.q(`UPDATE ${this.t("share_links")} SET view_count=?, status=? WHERE id=?`, [newCount, newStatus, linkId]);
    return { encryptedPayload: link.encrypted_payload, mode: link.mode as ShareLinkMode };
  }

  async revokeShareLink(linkId: string): Promise<void> {
    const [link] = await this.q<Record<string, string>>(`SELECT id FROM ${this.t("share_links")} WHERE id=?`, [linkId]);
    if (!link) throw AppError.notFound("ShareLink");
    await this.q(`UPDATE ${this.t("share_links")} SET status='REVOKED' WHERE id=?`, [linkId]);
  }

  async listShareLinks(secretId: string): Promise<VaultShareLink[]> {
    const rows = await this.q<Record<string, string>>(`SELECT * FROM ${this.t("share_links")} WHERE secret_id=? ORDER BY created_at DESC`, [secretId]);
    return rows.map(this.rowToShareLink);
  }

  private rowToProject(r: Record<string, string>): VaultProject {
    return { id: r.id, ownerId: r.owner_id, ownerType: r.owner_type as "USER" | "TEAM", name: r.name, description: r.description || undefined, status: r.status as "ACTIVE" | "DELETED", createdAt: r.created_at, updatedAt: r.updated_at };
  }

  private rowToEnvironment(r: Record<string, string>): VaultEnvironment {
    return { id: r.id, projectId: r.project_id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at };
  }

  private rowToSecret(r: Record<string, string>): VaultSecret {
    return { id: r.id, projectId: r.project_id, environmentId: r.environment_id, createdBy: r.created_by, name: r.name, type: r.type as SecretType, description: r.description || undefined, currentVersionId: r.current_version_id || undefined, status: r.status as "ACTIVE" | "DELETED", createdAt: r.created_at, updatedAt: r.updated_at };
  }

  private rowToVersion(r: Record<string, string>): VaultSecretVersion {
    return { id: r.id, secretId: r.secret_id, versionNumber: Number(r.version_number), encryptedValue: r.encrypted_value, encryptedKey: r.encrypted_key, iv: r.iv, createdBy: r.created_by, createdAt: r.created_at };
  }

  private rowToMember(r: Record<string, string>): VaultTeamMember {
    return { id: r.id, teamId: r.team_id, userId: r.user_id || undefined, invitedEmail: r.invited_email, invitedBy: r.invited_by, role: r.role as TeamRole, status: r.status as "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED", invitedAt: r.invited_at, respondedAt: r.responded_at || undefined, expiresAt: r.expires_at };
  }

  private rowToShareLink(r: Record<string, string>): VaultShareLink {
    return { id: r.id, secretId: r.secret_id, secretVersionId: r.secret_version_id, createdBy: r.created_by, mode: r.mode as ShareLinkMode, encryptedPayload: r.encrypted_payload, recipientPublicKey: r.recipient_public_key || undefined, maxViews: r.max_views ? Number(r.max_views) : undefined, viewCount: Number(r.view_count), expiresAt: r.expires_at, status: r.status as "ACTIVE" | "EXPIRED" | "EXHAUSTED" | "REVOKED", createdAt: r.created_at };
  }
}
