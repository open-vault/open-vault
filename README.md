# Open Vault

[![version](https://img.shields.io/badge/version-0.0.1-emerald?style=flat-square)](https://github.com/open-vault/open-vault)
[![license](https://img.shields.io/badge/license-MIT-zinc?style=flat-square)](./LICENSE)
[![built with Bun](https://img.shields.io/badge/built%20with-Bun-f472b6?style=flat-square&logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

**Secrets the server never sees.**

Open Vault is an end-to-end encrypted secrets manager for engineers and teams. Every secret is encrypted on your machine — using your SSH key you already have — before it ever touches a server. The server stores only ciphertext. There are no passwords, no accounts, and no vendor to trust with your plaintext.

No new key to manage. No new account to create. Your SSH fingerprint is your identity.

---

## Quick Start

```bash
bunx @open-vault/cli onboard
```

The onboarding wizard walks you through connecting your SSH key, choosing a storage backend, and storing your first secret. That is the entire setup.

No global install required. If you prefer `npm`:

```bash
npx @open-vault/cli onboard
```

---

## What It Looks Like

```
┌─────────────────────────────────────────────────────┐
│  open vault — onboarding                            │
├─────────────────────────────────────────────────────┤
│  ✔ Found SSH key: ~/.ssh/id_ed25519                 │
│  ✔ Adapter: r2 (Cloudflare R2)                      │
│  ✔ Registered fingerprint SHA256:3Xk...f9           │
│  ✔ Vault initialized                                │
│                                                     │
│  You're ready.                                      │
└─────────────────────────────────────────────────────┘

$ ov secret set DATABASE_URL --project production
  Enter value: ••••••••••••••••••••••••••••••••
  ✔ Encrypted and stored  (version 1)

$ ov secret get DATABASE_URL --project production
  postgres://user:password@host:5432/mydb
```

---

## How It Works

```
Your machine                       Server
────────────────                   ──────────────────────

  SSH private key
       │
       ▼
  HKDF-SHA256          plaintext
  ──────────►  ──────────────────►  AES-256-GCM
  master key    per-secret AES key   ciphertext    ──►  stored
                                     wrapped key   ──►  stored
                                     12-byte IV    ──►  stored

                                   (server never sees plaintext or master key)
```

1. **Key derivation** — Your SSH private key signs a fixed string. The signature feeds HKDF-SHA256 to produce a 32-byte master key, held in memory only.
2. **Secret encryption** — Each secret gets its own random AES-256-GCM key. That per-secret key is itself encrypted (wrapped) with the master key before storage.
3. **Server blindness** — The server stores `encryptedValue`, `encryptedKey`, and a 96-bit IV. Nothing else. Decryption happens exclusively on your machine.

---

## Installation

### Zero-install (recommended)

```bash
# With Bun
bunx @open-vault/cli onboard

# With npm / npx
npx @open-vault/cli onboard
```

Run any `ov` command the same way without a permanent install:

```bash
bunx @open-vault/cli secret list --project production
```

### Global install

```bash
# Bun
bun install -g @open-vault/cli

# npm
npm install -g @open-vault/cli
```

After a global install, use the short binary name for everything:

```bash
ov auth login
ov secret get DATABASE_URL --project production
```

### From source

```bash
git clone https://github.com/open-vault/open-vault.git
cd open-vault
bun install
bun run --cwd apps/cli dev
```

---

## Commands

### Auth

```bash
ov auth init --adapter r2 \
             --bucket my-vault \
             --endpoint https://xxx.r2.cloudflarestorage.com

ov auth login       # SSH challenge-response; stores session token locally
ov auth whoami      # Print current identity (fingerprint + display name)
```

### Secrets

```bash
ov secret set DATABASE_URL --project production
ov secret set DATABASE_URL --project production -e staging   # target an environment

ov secret get DATABASE_URL --project production
ov secret list     --project production
ov secret delete   DATABASE_URL --project production

# Bulk import/export
ov secret import .env      --project production
ov secret export           --project production --output .env

# Version history and rollback
ov secret versions DATABASE_URL --project production
ov secret rollback DATABASE_URL --version <version-id> --project production
```

All secret commands accept `-e / --env <name>` (default: `default`) to target a specific environment.

### Environments

```bash
ov env list   --project production
ov env create staging  --project production
ov env delete staging  --project production
```

### Projects

```bash
ov project create production
ov project list
ov project delete production
```

### Sharing

Two modes: time-limited (random key, you send the key to the recipient) or recipient-locked (encrypted to all of the recipient's GitHub SSH keys — no key to share).

**Time-limited** — share the ID and key with the recipient:

```bash
ov share create DATABASE_URL --project production --expires 24h --views 1
```

```
✓ Share link created
  ID:      abc123...
  Expires: 2026-03-18T...
  Key:     xK9mP2_qR...

  Send both the ID and Key to the recipient:
  ov share open abc123... --key xK9mP2_qR...
```

Recipient decrypts (no install needed):
```bash
npx @open-vault/cli share open <id> --key <key>
```

**Recipient-locked** — encrypted to the recipient's GitHub SSH keys; no key to transmit:

```bash
ov share create DATABASE_URL --project production --recipient-github alice
```

```
✓ Share link created (locked to @alice)
  ID:      def456...
  Expires: 2026-03-18T...

  Recipient runs:
  npx @open-vault/cli share open def456...
```

Recipient decrypts using `~/.ssh/id_ed25519` automatically — no `--key` needed:
```bash
npx @open-vault/cli share open <id>
```

**Other share commands:**
```bash
ov share list   DATABASE_URL --project production -e staging
ov share revoke <link-id>
```

### Teams

```bash
ov team create backend
ov team invite alice@example.com --team backend --role editor
ov team members                  --team backend
ov team role set alice editor    --team backend
ov team remove  alice            --team backend
```

### Interactive TUI

```bash
ov ui
```

Launches a full terminal UI (built with Ink) for browsing and editing secrets without typing individual commands.

---

## Adapters

Open Vault is storage-agnostic. Choose the backend that fits your infrastructure. No cloud lock-in.

| Adapter | Best for | Flag |
|---------|----------|------|
| `local` | Zero-config local dev | `--adapter local` |
| `s3` | AWS S3 bucket | `--adapter s3` |
| `r2` | Cloudflare R2 — zero egress, S3-compatible | `--adapter r2` |
| `convex` | Cloud-synced with realtime subscriptions | `--adapter convex` |
| `postgres` | Existing Postgres infrastructure | `--adapter postgres` |
| `mysql` | Existing MySQL / MariaDB infrastructure | `--adapter mysql` |
| `redis` | Fast key-value store | `--adapter redis` |

### Setup examples

**Local** — no credentials needed:

```bash
ov auth init --adapter local
# Vault lives at ~/.open-vault/vault/
```

**Cloudflare R2:**

```bash
ov auth init \
  --adapter r2 \
  --bucket my-vault \
  --endpoint https://<account-id>.r2.cloudflarestorage.com
```

**AWS S3:**

```bash
ov auth init \
  --adapter s3 \
  --bucket my-vault \
  --region us-east-1
# Uses standard AWS credential chain (env vars, ~/.aws, IAM role)
```

**Postgres:**

```bash
ov auth init \
  --adapter postgres \
  --connection-string "postgres://user:pass@host:5432/mydb"
```

**Redis:**

```bash
ov auth init \
  --adapter redis \
  --url "redis://localhost:6379"
```

**Convex** (cloud-synced):

```bash
ov auth init --adapter convex
# Prompts for your Convex deployment URL
```

---

## MCP Server — AI Tool Integration

Open Vault ships an [MCP](https://modelcontextprotocol.io) server that gives AI tools read access to your secrets. The server exposes three tools: `list_projects`, `list_secrets`, and `get_secret`. Decryption happens locally — the AI host never touches ciphertext directly.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-vault": {
      "command": "bunx",
      "args": ["@open-vault/mcp"]
    }
  }
}
```

Or with npm:

```json
{
  "mcpServers": {
    "open-vault": {
      "command": "npx",
      "args": ["@open-vault/mcp"]
    }
  }
}
```

No global install needed. `bunx` / `npx` download and run the server on demand.

### Claude Code Skill

Install the Open Vault skill to let Claude Code run `ov` commands on your behalf:

```bash
# From the repo root
cat packages/mcp/open-vault.skill.md
```

Follow the skill install instructions in that file. Once installed, Claude Code can set, get, and list secrets using natural language.

---

## Self-Hosting

Open Vault has no mandatory cloud service. Every adapter is self-contained:

- **`local`** — runs entirely on your machine, no network
- **`postgres` / `mysql` / `redis`** — connect to your own database
- **`s3` / `r2`** — point at any S3-compatible object store, including self-hosted MinIO

The only optional external dependency is Convex, which provides the managed cloud-sync adapter. Everything else is infra you own.

---

## Security Model

### What the server stores

```
encryptedValue   Base64url AES-256-GCM ciphertext of the secret
encryptedKey     Base64url AES-256-GCM wrapped per-secret key
iv               Base64url 96-bit nonce (unique per encryption)
```

The server never receives plaintext, the master key, or any key material that could recover plaintext. A full database dump is useless without the SSH private key.

### Key derivation

```
SSH private key
    │
    ▼  sign("open-vault-key-derivation-v1")
signature (64 bytes)
    │
    ▼  HKDF-SHA256(salt="open-vault-v1", info="master-key", length=32)
master key (32 bytes, memory only, never persisted)
```

### Per-secret envelope encryption

Each secret has its own random 32-byte AES key. That key is wrapped (encrypted) by the master key before leaving your machine. The server stores only wrapped keys — it cannot decrypt any secret independently of the others, and compromising one secret key compromises only that secret.

### Sharing

- **Time-limited links** — a random 32-byte share key encrypts the value. The key is placed in the URL fragment (`#key=...`). The server receives only the ciphertext; the fragment is never sent over HTTP.
- **Recipient-locked links** — the CLI fetches all Ed25519 keys from `github.com/<handle>.keys`, converts each to X25519, and wraps a content key for all of them using ECDH X25519 + HKDF-SHA256 + AES-GCM (multi-recipient, similar in structure to age). Only the recipient's Ed25519 SSH private key can decrypt it.

### Authentication

Authentication is SSH challenge-response. The server issues a random 32-byte challenge; you sign it with your private key; the server verifies the signature against your registered public key. No password is ever created or stored.

Session tokens are JWTs with a 24-hour TTL.

---

## Repo Structure

```
open-vault/
├── apps/
│   ├── cli/          # ov — the main CLI (Bun, Commander, Ink)
│   └── web/          # Marketing site + web dashboard (Next.js)
├── packages/
│   ├── adapter/      # 7 storage adapters (local, s3, r2, convex, postgres, mysql, redis)
│   ├── mcp/          # MCP server for AI tool integration
│   ├── errors/       # Shared error types and codes
│   ├── constants/    # Shared constants (key lengths, TTLs, validation rules)
│   └── shared/       # Shared utilities
└── convex/           # Convex backend functions
```

---

## Contributing

Open Vault is early-stage and actively developed. Contributions are welcome.

1. **Open an issue** before starting significant work — alignment early saves effort later.
2. **Fork and branch** — `git checkout -b your-feature`
3. **Test your changes** — `bun test`
4. **Open a pull request** with a clear description of what changed and why.

For bugs, include: OS, Bun/Node version, adapter in use, and the exact command that failed.

---

## License

MIT. See [LICENSE](./LICENSE).
