# Open Vault Printspec

> **Version:** 0.1.0
> **Runtime:** Bun 1.x (CLI + backend functions), Node 22+ compatible
> **Primary datastore:** Convex (cloud-hosted, realtime)
> **Output directory:** `.`

Open Vault is an end-to-end encrypted personal and team secrets manager. Secrets are encrypted client-side using a key derived from the user's SSH private key before ever leaving the device; the server stores only ciphertext. Users organize secrets into projects (namespaces), can share secrets via time-limited or recipient-locked one-time links, and interact primarily through a CLI with an optional TUI and a full web UI.

---

## Entities

### User

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| sshPublicKeyFingerprint | string | yes | — | SHA-256 fingerprint of SSH public key; uniquely identifies user |
| sshPublicKey | string | yes | — | Full OpenSSH public key string (ed25519 or rsa) |
| email | string | no | null | Optional; used for team invitations |
| displayName | string | no | null | Optional display name |
| createdAt | RFC3339 UTC | yes | now() | |
| updatedAt | RFC3339 UTC | yes | now() | |

**Indexes:** `sshPublicKeyFingerprint` (unique), `email` (unique, sparse)

---

### Project

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| ownerId | UUIDv7 | yes | — | FK → User or Team |
| ownerType | enum(USER, TEAM) | yes | USER | |
| name | string | yes | — | Slug: `/^[a-z][a-z0-9_/-]{1,127}$/` (e.g. `myapp/prod`) |
| description | string | no | null | |
| createdAt | RFC3339 UTC | yes | now() | |
| updatedAt | RFC3339 UTC | yes | now() | |

**Indexes:** `(ownerId, ownerType, name)` (unique)
**Lifecycle states:** `ACTIVE → DELETED`

---

### Secret

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| projectId | UUIDv7 | yes | — | FK → Project |
| createdBy | UUIDv7 | yes | — | FK → User |
| name | string | yes | — | `/^[A-Z][A-Z0-9_]{0,254}$/` for KV; free slug for others |
| type | enum(KV, ENV_FILE, NOTE, JSON) | yes | KV | |
| description | string | no | null | |
| currentVersionId | UUIDv7 | no | null | FK → SecretVersion; null until first version written |
| createdAt | RFC3339 UTC | yes | now() | |
| updatedAt | RFC3339 UTC | yes | now() | |

**Indexes:** `(projectId, name)` (unique), `createdBy`, `currentVersionId`
**Lifecycle states:** `ACTIVE → DELETED`

---

### SecretVersion

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| secretId | UUIDv7 | yes | — | FK → Secret |
| versionNumber | integer | yes | — | Auto-incremented per secret, starting at 1 |
| encryptedValue | string | yes | — | Base64url-encoded AES-256-GCM ciphertext |
| encryptedKey | string | yes | — | Base64url-encoded wrapped symmetric key (encrypted with user's derived master key) |
| iv | string | yes | — | Base64url-encoded 96-bit IV |
| createdBy | UUIDv7 | yes | — | FK → User |
| createdAt | RFC3339 UTC | yes | now() | |

**Indexes:** `(secretId, versionNumber)` (unique), `secretId`

---

### Team

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| name | string | yes | — | `/^[a-z][a-z0-9_-]{2,63}$/` |
| slug | string | yes | — | URL-safe unique slug; same format as name |
| createdBy | UUIDv7 | yes | — | FK → User |
| encryptedTeamKey | string | yes | — | The team vault key, stored as a map: { userId → base64url(encryptedKey) } |
| createdAt | RFC3339 UTC | yes | now() | |
| updatedAt | RFC3339 UTC | yes | now() | |

**Indexes:** `slug` (unique), `createdBy`

---

### TeamMember

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| teamId | UUIDv7 | yes | — | FK → Team |
| userId | UUIDv7 | no | null | Null until invitation accepted |
| invitedEmail | string | yes | — | Email the invitation was sent to |
| invitedBy | UUIDv7 | yes | — | FK → User |
| role | enum(OWNER, EDITOR, VIEWER) | yes | VIEWER | |
| status | enum(PENDING, ACCEPTED, DECLINED, EXPIRED) | yes | PENDING | |
| invitedAt | RFC3339 UTC | yes | now() | |
| respondedAt | RFC3339 UTC | no | null | |
| expiresAt | RFC3339 UTC | yes | now()+72h | Invitation expiry |

**Indexes:** `(teamId, userId)` (unique, sparse), `(teamId, invitedEmail)`, `invitedEmail`
**Lifecycle states:** `PENDING → ACCEPTED | DECLINED | EXPIRED`

---

### ShareLink

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| secretId | UUIDv7 | yes | — | FK → Secret |
| secretVersionId | UUIDv7 | yes | — | FK → SecretVersion; captures version at creation time |
| createdBy | UUIDv7 | yes | — | FK → User |
| mode | enum(TIME_LIMITED, RECIPIENT_LOCKED) | yes | — | |
| encryptedPayload | string | yes | — | Base64url ciphertext of secret value for this share |
| recipientPublicKey | string | no | null | Required when mode=RECIPIENT_LOCKED; OpenSSH public key |
| maxViews | integer | no | null | Null = unlimited views until expiry |
| viewCount | integer | yes | 0 | |
| expiresAt | RFC3339 UTC | yes | — | Required; max 30 days from creation |
| status | enum(ACTIVE, EXPIRED, EXHAUSTED, REVOKED) | yes | ACTIVE | |
| createdAt | RFC3339 UTC | yes | now() | |

**Indexes:** `secretId`, `createdBy`, `status`
**Lifecycle states:** `ACTIVE → EXPIRED (time) | EXHAUSTED (views) | REVOKED (manual)`

---

### ShareLinkAccess

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | UUIDv7 | yes | generated | primary key |
| shareLinkId | UUIDv7 | yes | — | FK → ShareLink |
| accessedAt | RFC3339 UTC | yes | now() | |
| ipHash | string | no | null | SHA-256 of accessor IP for audit (not stored in plaintext) |

**Indexes:** `shareLinkId`

---

## Functional Requirements

| ID | Priority | Behavior | Inputs | Outputs | Errors |
|----|----------|----------|--------|---------|--------|
| FR-001 | P1 | Register SSH public key; create User if fingerprint not seen before | SSH public key string | User record + session token | `validation_error` |
| FR-002 | P1 | Authenticate: sign a server-issued challenge with SSH private key; exchange for session token | SSH fingerprint + signed challenge | Session token (JWT, 24h TTL) | `auth_failed`, `not_found` |
| FR-003 | P1 | Create a project under the caller's user or a team they own/edit | project name, ownerType, optional teamId | Project record | `validation_error`, `duplicate_resource`, `forbidden` |
| FR-004 | P1 | List projects for the current user (personal + team) | — | Array of Project | — |
| FR-005 | P1 | Delete a project (soft delete; secrets become inaccessible) | projectId | — | `not_found`, `forbidden` |
| FR-006 | P1 | Create a secret in a project; initial version uploaded | projectId, name, type, encryptedValue, encryptedKey, iv | Secret + SecretVersion | `validation_error`, `duplicate_resource`, `forbidden` |
| FR-007 | P1 | Update a secret: store new encrypted value as a new SecretVersion; update currentVersionId | secretId, encryptedValue, encryptedKey, iv | SecretVersion | `not_found`, `forbidden` |
| FR-008 | P1 | Get a secret (current version) for decryption client-side | secretId | Secret + current SecretVersion (ciphertext only) | `not_found`, `forbidden` |
| FR-009 | P1 | List secrets in a project | projectId, optional type filter | Array of Secret (metadata only, no ciphertext) | `not_found`, `forbidden` |
| FR-010 | P1 | Delete a secret (soft delete) | secretId | — | `not_found`, `forbidden` |
| FR-011 | P1 | List all versions of a secret | secretId | Array of SecretVersion (metadata + ciphertext) | `not_found`, `forbidden` |
| FR-012 | P1 | Rollback a secret to a prior version (creates a new version that duplicates prior ciphertext) | secretId, targetVersionId | New SecretVersion | `not_found`, `forbidden`, `validation_error` |
| FR-013 | P1 | Create a time-limited share link | secretId, expiresAt, optional maxViews, encryptedPayload | ShareLink + share URL | `not_found`, `forbidden`, `validation_error` |
| FR-014 | P1 | Create a recipient-locked share link | secretId, expiresAt, recipientPublicKey, encryptedPayload | ShareLink + share URL | `not_found`, `forbidden`, `validation_error` |
| FR-015 | P1 | Access a share link: validate it is ACTIVE, not expired, not exhausted; increment viewCount; return payload; transition to EXHAUSTED if maxViews reached | shareLinkId | encryptedPayload | `not_found`, `share_link_expired`, `share_link_exhausted`, `share_link_revoked` |
| FR-016 | P1 | Revoke a share link | shareLinkId | — | `not_found`, `forbidden` |
| FR-017 | P1 | List share links for a secret | secretId | Array of ShareLink (no payload) | `not_found`, `forbidden` |
| FR-018 | P2 | Create a team | name | Team record | `validation_error`, `duplicate_resource` |
| FR-019 | P2 | Invite a user to a team by email; creates PENDING TeamMember | teamId, email, role | TeamMember | `not_found`, `forbidden`, `validation_error` |
| FR-020 | P2 | Accept or decline a team invitation | teamMemberId | TeamMember (updated) | `not_found`, `invalid_transition` |
| FR-021 | P2 | List team members | teamId | Array of TeamMember | `not_found`, `forbidden` |
| FR-022 | P2 | Update a team member's role | teamMemberId, role | TeamMember (updated) | `not_found`, `forbidden` |
| FR-023 | P2 | Remove a team member | teamMemberId | — | `not_found`, `forbidden` |
| FR-024 | P2 | Import secrets from a .env file (batch create/update secrets in a project) | projectId, parsed env entries (array of {name, encryptedValue, encryptedKey, iv}) | Array of Secret | `forbidden`, `validation_error` |
| FR-025 | P2 | Export secrets from a project as a .env file (client-side decryption; server returns ciphertexts) | projectId | Array of { name, encryptedValue, encryptedKey, iv } | `forbidden`, `not_found` |
| FR-026 | P2 | CLI `os ui` launches interactive TUI for browsing/editing secrets | — | TUI session | — |
| FR-027 | P2 | Expire invitations older than 72 hours (background job / Convex scheduled function) | — | TeamMember status set to EXPIRED | — |
| FR-028 | P2 | Expire share links past expiresAt (background job / Convex scheduled function) | — | ShareLink status set to EXPIRED | — |
| FR-029 | P3 | Search secrets by name within a project | projectId, query string | Array of Secret (metadata) | `forbidden` |
| FR-030 | P3 | Web UI: full management interface mirroring all CLI capabilities | — | Rendered web app | — |

---

## Command / API Surface

Convex functions. Method = `query` (read-only) or `mutation` (write).

| ID | Method | Path / Name | Request Schema | Success | Errors |
|----|--------|-------------|----------------|---------|--------|
| CMD-001 | mutation | `auth.registerOrLogin` | `{ publicKey: string }` → returns challenge | `{ challenge: string }` | `validation_error` |
| CMD-002 | mutation | `auth.verifyChallenge` | `{ fingerprint: string, signature: string, challenge: string }` | `{ token: string, userId: string }` | `auth_failed`, `not_found` |
| CMD-003 | query | `users.me` | (auth token in header) | `User` | `not_found` |
| CMD-004 | mutation | `projects.create` | `{ name: string, ownerType: "USER"\|"TEAM", teamId?: string }` | `Project` | `validation_error`, `duplicate_resource`, `forbidden` |
| CMD-005 | query | `projects.list` | `{ ownerType?: "USER"\|"TEAM", teamId?: string }` | `Project[]` | `forbidden` |
| CMD-006 | mutation | `projects.delete` | `{ projectId: string }` | `{ success: true }` | `not_found`, `forbidden` |
| CMD-007 | mutation | `secrets.create` | `{ projectId, name, type, encryptedValue, encryptedKey, iv, description? }` | `{ secret: Secret, version: SecretVersion }` | `validation_error`, `duplicate_resource`, `forbidden` |
| CMD-008 | mutation | `secrets.update` | `{ secretId, encryptedValue, encryptedKey, iv }` | `SecretVersion` | `not_found`, `forbidden` |
| CMD-009 | query | `secrets.get` | `{ secretId: string }` | `{ secret: Secret, version: SecretVersion }` | `not_found`, `forbidden` |
| CMD-010 | query | `secrets.list` | `{ projectId: string, type?: SecretType }` | `Secret[]` | `not_found`, `forbidden` |
| CMD-011 | mutation | `secrets.delete` | `{ secretId: string }` | `{ success: true }` | `not_found`, `forbidden` |
| CMD-012 | query | `secrets.listVersions` | `{ secretId: string }` | `SecretVersion[]` | `not_found`, `forbidden` |
| CMD-013 | mutation | `secrets.rollback` | `{ secretId: string, targetVersionId: string }` | `SecretVersion` | `not_found`, `forbidden`, `validation_error` |
| CMD-014 | mutation | `shareLinks.create` | `{ secretId, mode, encryptedPayload, expiresAt, maxViews?, recipientPublicKey? }` | `ShareLink` | `not_found`, `forbidden`, `validation_error` |
| CMD-015 | mutation | `shareLinks.access` | `{ shareLinkId: string }` | `{ encryptedPayload: string, mode: string }` | `not_found`, `share_link_expired`, `share_link_exhausted`, `share_link_revoked` |
| CMD-016 | mutation | `shareLinks.revoke` | `{ shareLinkId: string }` | `{ success: true }` | `not_found`, `forbidden` |
| CMD-017 | query | `shareLinks.list` | `{ secretId: string }` | `ShareLink[]` (no payload field) | `not_found`, `forbidden` |
| CMD-018 | mutation | `teams.create` | `{ name: string }` | `Team` | `validation_error`, `duplicate_resource` |
| CMD-019 | mutation | `teams.invite` | `{ teamId, email, role }` | `TeamMember` | `not_found`, `forbidden`, `validation_error` |
| CMD-020 | mutation | `teams.respond` | `{ teamMemberId, response: "ACCEPT"\|"DECLINE" }` | `TeamMember` | `not_found`, `invalid_transition` |
| CMD-021 | query | `teams.listMembers` | `{ teamId: string }` | `TeamMember[]` | `not_found`, `forbidden` |
| CMD-022 | mutation | `teams.setRole` | `{ teamMemberId, role }` | `TeamMember` | `not_found`, `forbidden` |
| CMD-023 | mutation | `teams.removeMember` | `{ teamMemberId: string }` | `{ success: true }` | `not_found`, `forbidden` |
| CMD-024 | mutation | `secrets.batchCreate` | `{ projectId, secrets: Array<{name, type, encryptedValue, encryptedKey, iv}> }` | `Secret[]` | `validation_error`, `forbidden` |
| CMD-025 | query | `secrets.listForExport` | `{ projectId: string }` | `Array<{name, type, encryptedValue, encryptedKey, iv}>` | `not_found`, `forbidden` |
| CMD-026 | query | `secrets.search` | `{ projectId: string, q: string }` | `Secret[]` | `not_found`, `forbidden` |

---

## CLI Command Surface

| ID | Command | Description |
|----|---------|-------------|
| CLI-001 | `os auth init` | Register SSH key with backend; prompt for key path |
| CLI-002 | `os auth login` | Authenticate (challenge-response with SSH key) |
| CLI-003 | `os auth logout` | Clear local session token |
| CLI-004 | `os auth whoami` | Print current user identity |
| CLI-005 | `os project create <name>` | Create a project; `--team <slug>` for team projects |
| CLI-006 | `os project list` | List all accessible projects |
| CLI-007 | `os project delete <name>` | Delete a project |
| CLI-008 | `os secret set <name> [--project <p>] [--type <t>] [--file <f>]` | Create or update a secret |
| CLI-009 | `os secret get <name> [--project <p>] [--raw]` | Get and decrypt a secret |
| CLI-010 | `os secret list [--project <p>] [--type <t>]` | List secrets |
| CLI-011 | `os secret delete <name> [--project <p>]` | Delete a secret |
| CLI-012 | `os secret versions <name> [--project <p>]` | List version history |
| CLI-013 | `os secret rollback <name> --version <id> [--project <p>]` | Rollback to a prior version |
| CLI-014 | `os secret import <file> [--project <p>]` | Bulk import from .env file |
| CLI-015 | `os secret export [--project <p>] [--output <file>]` | Export project secrets as .env |
| CLI-016 | `os share create <secret-name> [--project <p>] [--expires <duration>] [--views <n>] [--recipient-key <pubkey>]` | Create a share link |
| CLI-017 | `os share list <secret-name> [--project <p>]` | List share links for a secret |
| CLI-018 | `os share revoke <link-id>` | Revoke a share link |
| CLI-019 | `os share open <link-id>` | Decrypt and display a shared secret (for recipient) |
| CLI-020 | `os team create <name>` | Create a team |
| CLI-021 | `os team invite <email> --team <slug> [--role viewer\|editor\|owner]` | Invite user |
| CLI-022 | `os team members --team <slug>` | List team members |
| CLI-023 | `os team role set <user> <role> --team <slug>` | Update member role |
| CLI-024 | `os team remove <user> --team <slug>` | Remove member |
| CLI-025 | `os ui` | Launch interactive TUI |

---

## State Machines

### Secret States

```
ACTIVE → DELETED [guard: caller is secret creator or project owner]
```

**Terminal states:** `DELETED`
**Invalid transitions:** any not listed must throw `invalid_transition`

---

### Project States

```
ACTIVE → DELETED [guard: caller is project owner]
```

**Terminal states:** `DELETED`

---

### ShareLink States

```
ACTIVE → EXPIRED   [guard: current time > expiresAt; enforced on access + scheduled job]
ACTIVE → EXHAUSTED [guard: viewCount >= maxViews after increment; enforced on access]
ACTIVE → REVOKED   [guard: caller is shareLink creator or project owner]
```

**Terminal states:** `EXPIRED`, `EXHAUSTED`, `REVOKED`
**Invalid transitions:** EXPIRED/EXHAUSTED/REVOKED → any must throw `invalid_transition`

---

### TeamMember Invitation States

```
PENDING  → ACCEPTED  [guard: responding user's email matches invitedEmail]
PENDING  → DECLINED  [guard: responding user's email matches invitedEmail]
PENDING  → EXPIRED   [guard: current time > expiresAt; enforced by scheduled job FR-027]
ACCEPTED → (no transitions; use teams.removeMember to remove)
```

**Terminal states:** `DECLINED`, `EXPIRED`
**Invalid transitions:** any not listed must throw `invalid_transition`

---

## Encryption Architecture

All encryption is performed **client-side only**. The server never receives or stores plaintext.

### Key Derivation

1. Client requests a 32-byte challenge from the server.
2. Client signs the fixed string `"open-vault-key-derivation-v1"` using `ssh-agent` or the private key file.
3. Client computes `masterKey = HKDF-SHA256(signature, salt="open-vault-v1", info="master-key", length=32)`.
4. `masterKey` is held in memory only; never persisted.

### Secret Encryption

1. Generate random 32-byte `secretKey` and 12-byte `iv`.
2. Encrypt plaintext value: `ciphertext = AES-256-GCM(secretKey, iv, plaintext)`.
3. Encrypt `secretKey` with master key: `encryptedKey = AES-256-GCM(masterKey, freshIV, secretKey)`.
4. Store `encryptedValue` (ciphertext), `encryptedKey`, `iv` on server.

### Share Link Encryption (TIME_LIMITED)

1. Generate random 32-byte `shareKey`.
2. `encryptedPayload = AES-256-GCM(shareKey, iv, plaintextSecretValue)`.
3. Store `encryptedPayload` on server.
4. The `shareKey` is base64url-encoded and appended as a URL fragment (`#key=<shareKey>`). The server **never** receives the fragment.

### Share Link Encryption (RECIPIENT_LOCKED)

1. Encrypt `plaintextSecretValue` using the recipient's SSH public key via `age` encryption (`age-encryption.org/v1`).
2. Store the `age` ciphertext as `encryptedPayload`.
3. Recipient decrypts using their SSH private key via `age`.

### Team Vault Key

1. On team creation, generate random 32-byte `teamVaultKey`.
2. For each member (including creator), encrypt `teamVaultKey` with member's SSH public key using `age`.
3. Store as `encryptedTeamKey: { [userId]: base64url(ageEncryptedTeamKey) }`.
4. When member joins, their encrypted copy is added using their public key.
5. Members use `teamVaultKey` instead of `masterKey` when accessing team project secrets.

---

## Determinism Contracts

| Contract | Rule |
|----------|------|
| ID format | UUIDv7, generated at creation time, client-side for CLI, server-side for mutations |
| Timestamp format | RFC3339 UTC milliseconds (e.g. `2026-03-16T12:00:00.000Z`) |
| Project name validation | `/^[a-z][a-z0-9_/-]{1,127}$/` |
| Secret name validation (KV) | `/^[A-Z][A-Z0-9_]{0,254}$/` |
| Secret name validation (ENV_FILE, NOTE, JSON) | `/^[a-z][a-z0-9_-]{0,127}$/` |
| Team name / slug | `/^[a-z][a-z0-9_-]{2,63}$/` |
| Sort order (secrets list) | `name ASC` |
| Sort order (versions list) | `versionNumber DESC` |
| Sort order (share links list) | `createdAt DESC` |
| Default page size | 50 |
| Max page size | 200 |
| Session token TTL | 24 hours |
| Invitation expiry | 72 hours from creation |
| Share link max expiry | 30 days from creation |
| Key derivation | HKDF-SHA256 as described in Encryption Architecture |
| Symmetric encryption | AES-256-GCM |
| Recipient lock encryption | age v1 (`filippo.io/age`) |
| IV / nonce length | 96 bits (12 bytes) |

---

## Error Contract

This set is closed. No agent may add or remove codes.

| Code | HTTP Equivalent | Meaning |
|------|----------------|---------|
| `validation_error` | 400 | Input failed schema validation |
| `auth_failed` | 401 | SSH challenge verification failed |
| `unauthenticated` | 401 | No valid session token provided |
| `forbidden` | 403 | Caller lacks permission for this resource |
| `not_found` | 404 | Resource does not exist or is deleted |
| `duplicate_resource` | 409 | Unique constraint violated |
| `invalid_transition` | 422 | State machine guard rejected the transition |
| `share_link_expired` | 410 | Share link has passed its expiresAt |
| `share_link_exhausted` | 410 | Share link has reached its maxViews limit |
| `share_link_revoked` | 410 | Share link was manually revoked |
| `internal_error` | 500 | Unexpected server failure |

---

## Test Plan

Tests MUST be implemented in this order: broken → failure → happy.

| ID | Order | Fixture | Scenario | Assertion |
|----|-------|---------|----------|-----------|
| T-001 | broken | `fixture-auth-no-key.json` | register with missing public key | throws `validation_error` |
| T-002 | broken | `fixture-auth-bad-key.json` | register with malformed public key string | throws `validation_error` |
| T-003 | broken | `fixture-project-bad-name.json` | create project with uppercase name | throws `validation_error` |
| T-004 | broken | `fixture-secret-bad-name.json` | create KV secret with lowercase name | throws `validation_error` |
| T-005 | broken | `fixture-share-past-expiry.json` | create share link with expiresAt in the past | throws `validation_error` |
| T-006 | broken | `fixture-share-over-max-expiry.json` | create share link with expiresAt > 30 days | throws `validation_error` |
| T-007 | failure | `fixture-auth-wrong-sig.json` | verify challenge with wrong signature | throws `auth_failed` |
| T-008 | failure | `fixture-project-duplicate.json` | create two projects with same name under same owner | throws `duplicate_resource` |
| T-009 | failure | `fixture-secret-duplicate.json` | create two secrets with same name in same project | throws `duplicate_resource` |
| T-010 | failure | `fixture-secret-forbidden.json` | get a secret belonging to a different user | throws `forbidden` |
| T-011 | failure | `fixture-share-link-expired.json` | access a share link past its expiresAt | throws `share_link_expired` |
| T-012 | failure | `fixture-share-link-exhausted.json` | access a share link with viewCount >= maxViews | throws `share_link_exhausted` |
| T-013 | failure | `fixture-share-link-revoked.json` | access a revoked share link | throws `share_link_revoked` |
| T-014 | failure | `fixture-team-invite-wrong-user.json` | accept invitation as wrong user | throws `invalid_transition` |
| T-015 | happy | `fixture-user-valid.json` | register valid SSH ed25519 public key | returns User with id and fingerprint |
| T-016 | happy | `fixture-project-valid.json` | create project with valid slug | returns Project with ownerId = current user |
| T-017 | happy | `fixture-secret-create.json` | create KV secret with encrypted payload | returns Secret + SecretVersion with versionNumber=1 |
| T-018 | happy | `fixture-secret-update.json` | update secret twice | returns SecretVersion with versionNumber=2, then versionNumber=3 |
| T-019 | happy | `fixture-secret-rollback.json` | rollback to version 1 after 2 updates | returns SecretVersion with versionNumber=4 duplicating version 1 ciphertext |
| T-020 | happy | `fixture-share-time-limited.json` | create and access a valid time-limited share link | returns encryptedPayload; viewCount incremented |
| T-021 | happy | `fixture-share-exhausts.json` | access a maxViews=1 share link once | second access throws `share_link_exhausted` |
| T-022 | happy | `fixture-team-flow.json` | create team, invite user, accept, create team project, create secret in it | all steps succeed; invited user can access secrets |
| T-023 | happy | `fixture-env-import.json` | batch import 3 env vars via batchCreate | returns array of 3 Secrets |

---

## Design & Style

| Attribute | Value |
|-----------|-------|
| UI framework | React 19 (Convex + React) |
| Component library | shadcn/ui |
| CSS approach | Tailwind v4 |
| Color scheme | Dark mode first; neutral zinc base + emerald-500 accent; destructive actions in red-500 |
| Typography | JetBrains Mono for secret values and code; Inter (system-ui fallback) for UI chrome |
| Spacing system | 4px base unit, Tailwind default scale |
| Border radius | `rounded-md` globally; `rounded-full` on status badges |
| Icon set | Lucide React |
| Motion / animation | Subtle fade + scale transitions (100ms); `prefers-reduced-motion` respected |
| Layout pattern | Two-column: sidebar (projects / teams navigator) + main content (secrets list → detail panel) |
| Tone | Minimal, dense, developer-tool; no decorative illustrations |
| Notable conventions | Secret values always obscured (•••••) until explicitly revealed; destructive actions require confirmation dialog; share links shown with one-click copy; version history shown as a timeline |
| TUI library | `ink` (React for CLIs) for the `os ui` interactive TUI |

---

## Appendix — Constants

These values are law. Never change them in code.

```
MAX_PROJECT_NAME_LENGTH = 128
MIN_PROJECT_NAME_LENGTH = 2
MAX_SECRET_NAME_LENGTH_KV = 255
MAX_SECRET_NAME_LENGTH_OTHER = 128
MAX_TEAM_NAME_LENGTH = 64
MIN_TEAM_NAME_LENGTH = 3
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
SESSION_TOKEN_TTL_HOURS = 24
INVITATION_EXPIRY_HOURS = 72
SHARE_LINK_MAX_EXPIRY_DAYS = 30
KEY_DERIVATION_INFO = "open-vault-v1"
KEY_DERIVATION_SALT = "open-vault-key-derivation-v1"
KEY_DERIVATION_LENGTH_BYTES = 32
IV_LENGTH_BYTES = 12
AES_KEY_LENGTH_BITS = 256
CHALLENGE_LENGTH_BYTES = 32
```
