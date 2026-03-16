"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import "../marketing.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TocEntry {
  id: string;
  label: string;
  step: number;
}

interface CodeLine {
  type: "prompt" | "comment" | "output" | "success" | "blank";
  text: string;
}

interface Step {
  id: string;
  number: number;
  title: string;
  description: string;
  note?: string;
  lines: CodeLine[];
  terminalTitle?: string;
}

interface AdapterConfig {
  id: "local" | "s3" | "r2" | "convex" | "postgres" | "mysql" | "redis";
  label: string;
  tagline: string;
  isDefault?: boolean;
  complexity: "Zero config" | "Low" | "Medium" | "High";
  requirements: string[];
  envVars?: Array<{ name: string; hint: string }>;
  lines: CodeLine[];
  note: string;
}

// ─── Inline SVG Icons ─────────────────────────────────────────────────────────

function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

function IconGithub() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

// ─── Adapter Configs ──────────────────────────────────────────────────────────

const ADAPTER_CONFIGS: AdapterConfig[] = [
  {
    id: "local",
    label: "Local",
    tagline: "Store secrets on local disk. No accounts, no cloud, no setup.",
    isDefault: true,
    complexity: "Zero config",
    requirements: ["SSH key (already set up in step 1)"],
    lines: [
      { type: "comment", text: "# local is the default — no flags needed" },
      { type: "prompt", text: "ov auth init" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: local" },
      { type: "output", text: "Vault: ~/.open-vault/vault/" },
      { type: "blank", text: "" },
      { type: "success", text: "Config saved. Run `ov auth login` to authenticate." },
    ],
    note: "Secrets live in ~/.open-vault/vault/ as encrypted JSON files, readable only by your OS user. Perfect for personal dev machines or offline environments.",
  },
  {
    id: "s3",
    label: "S3",
    tagline: "Store secrets in an AWS S3 bucket using your existing IAM credentials.",
    complexity: "Low",
    requirements: [
      "AWS account + S3 bucket",
      "IAM user or role with s3:GetObject, s3:PutObject, s3:DeleteObject, s3:ListBucket",
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (or AWS CLI configured)",
    ],
    envVars: [
      { name: "AWS_ACCESS_KEY_ID", hint: "your-access-key" },
      { name: "AWS_SECRET_ACCESS_KEY", hint: "your-secret" },
    ],
    lines: [
      { type: "comment", text: "# export AWS credentials (or configure ~/.aws/credentials)" },
      { type: "prompt", text: "export AWS_ACCESS_KEY_ID=AKIA..." },
      { type: "prompt", text: "export AWS_SECRET_ACCESS_KEY=..." },
      { type: "blank", text: "" },
      { type: "comment", text: "# init with your bucket name and region" },
      { type: "prompt", text: "ov auth init --adapter s3 --bucket my-vault --region us-east-1" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: s3" },
      { type: "output", text: "Bucket: my-vault (us-east-1)" },
      { type: "blank", text: "" },
      { type: "success", text: "Config saved. Run `ov auth login` to authenticate." },
    ],
    note: "Works with any standard AWS IAM credential provider — env vars, ~/.aws/credentials, instance profiles, or IAM roles. The bucket must already exist.",
  },
  {
    id: "r2",
    label: "R2",
    tagline: "Store secrets in Cloudflare R2 — S3-compatible, zero egress fees.",
    complexity: "Low",
    requirements: [
      "Cloudflare account + R2 bucket",
      "R2 API token with Object Read & Write permissions",
      "Your Cloudflare account ID",
    ],
    envVars: [
      { name: "AWS_ACCESS_KEY_ID", hint: "r2-access-key-id" },
      { name: "AWS_SECRET_ACCESS_KEY", hint: "r2-secret-access-key" },
    ],
    lines: [
      { type: "comment", text: "# R2 uses S3-compatible credentials from Cloudflare dashboard" },
      { type: "prompt", text: "export AWS_ACCESS_KEY_ID=<r2-access-key-id>" },
      { type: "prompt", text: "export AWS_SECRET_ACCESS_KEY=<r2-secret>" },
      { type: "blank", text: "" },
      { type: "comment", text: "# find your account ID at dash.cloudflare.com" },
      { type: "prompt", text: "ov auth init --adapter r2 --bucket my-vault \\" },
      { type: "output", text: "  --endpoint https://<account-id>.r2.cloudflarestorage.com" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: r2" },
      { type: "output", text: "Bucket: my-vault" },
      { type: "output", text: "Endpoint: https://<account-id>.r2.cloudflarestorage.com" },
      { type: "blank", text: "" },
      { type: "success", text: "Config saved. Run `ov auth login` to authenticate." },
    ],
    note: "R2 API tokens are created in the Cloudflare dashboard under R2 → Manage API Tokens. Zero egress costs make it excellent for frequent secret reads.",
  },
  {
    id: "convex",
    label: "Convex",
    tagline: "Store secrets in Convex — real-time sync, SSH challenge-response auth.",
    complexity: "Medium",
    requirements: [
      "A Convex deployment (free tier available at convex.dev)",
      "Convex deployment URL (from your dashboard)",
    ],
    lines: [
      { type: "comment", text: "# point at your Convex deployment URL" },
      { type: "prompt", text: "ov auth init --adapter convex --url https://xxx.convex.cloud" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: convex" },
      { type: "output", text: "URL: https://xxx.convex.cloud" },
      { type: "blank", text: "" },
      { type: "success", text: "Config saved. Run `ov auth login` to authenticate." },
      { type: "blank", text: "" },
      { type: "comment", text: "# login triggers SSH challenge-response" },
      { type: "prompt", text: "ov auth login" },
      { type: "blank", text: "" },
      { type: "output", text: "Signing challenge with ~/.ssh/id_ed25519..." },
      { type: "success", text: "Authenticated. Session token saved." },
    ],
    note: "Convex is the only adapter that performs SSH challenge-response authentication — the server cryptographically verifies your identity. Ideal for teams and server-side deployments.",
  },
  {
    id: "postgres",
    label: "Postgres",
    tagline: "Store secrets in a PostgreSQL database. Self-hosted or any managed provider.",
    complexity: "Medium",
    requirements: [
      "PostgreSQL ≥ 12 (local, RDS, Neon, Supabase, Railway, etc.)",
      "A database connection URL",
      "CREATE TABLE permissions (schema auto-created on first run)",
    ],
    envVars: [
      { name: "DATABASE_URL", hint: "postgres://user:pass@host:5432/mydb" },
    ],
    lines: [
      { type: "comment", text: "# set your connection URL" },
      { type: "prompt", text: "export DATABASE_URL=postgres://user:pass@host:5432/mydb" },
      { type: "blank", text: "" },
      { type: "comment", text: "# init with postgres adapter" },
      { type: "prompt", text: "ov auth init --adapter postgres --db-url $DATABASE_URL" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: postgres" },
      { type: "output", text: "DB: host:5432/mydb" },
      { type: "output", text: "Schema: migrating..." },
      { type: "success", text: "Tables created. Config saved. Run `ov auth login` to authenticate." },
    ],
    note: "Schema is created automatically on first use — no migration files to manage. Works with any Postgres-compatible database: RDS, Neon, Supabase, PlanetScale (Postgres mode), Railway, and Fly.io Postgres.",
  },
  {
    id: "mysql",
    label: "MySQL",
    tagline: "Store secrets in MySQL or MariaDB. Works with any standard MySQL connection URL.",
    complexity: "Medium",
    requirements: [
      "MySQL ≥ 8 or MariaDB ≥ 10.4",
      "A database connection URL",
      "CREATE TABLE permissions (schema auto-created on first run)",
    ],
    envVars: [
      { name: "DATABASE_URL", hint: "mysql://user:pass@host:3306/mydb" },
    ],
    lines: [
      { type: "comment", text: "# set your connection URL" },
      { type: "prompt", text: "export DATABASE_URL=mysql://user:pass@host:3306/mydb" },
      { type: "blank", text: "" },
      { type: "comment", text: "# init with mysql adapter" },
      { type: "prompt", text: "ov auth init --adapter mysql --db-url $DATABASE_URL" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: mysql" },
      { type: "output", text: "DB: host:3306/mydb" },
      { type: "output", text: "Schema: migrating..." },
      { type: "success", text: "Tables created. Config saved. Run `ov auth login` to authenticate." },
    ],
    note: "Schema is created automatically using CREATE TABLE IF NOT EXISTS statements — safe to run against existing databases. Compatible with MySQL 8+, MariaDB, PlanetScale, and any mysql2-compatible driver.",
  },
  {
    id: "redis",
    label: "Redis",
    tagline: "Store secrets in Redis using sorted-set indexes for fast O(1) lookups.",
    complexity: "Low",
    requirements: [
      "Redis ≥ 6 (local, Upstash, Redis Cloud, Railway, Fly.io, etc.)",
      "A Redis connection URL",
    ],
    envVars: [
      { name: "REDIS_URL", hint: "redis://user:pass@host:6379" },
    ],
    lines: [
      { type: "comment", text: "# set your Redis URL" },
      { type: "prompt", text: "export REDIS_URL=redis://user:pass@host:6379" },
      { type: "blank", text: "" },
      { type: "comment", text: "# init with redis adapter" },
      { type: "prompt", text: "ov auth init --adapter redis --redis-url $REDIS_URL" },
      { type: "blank", text: "" },
      { type: "output", text: "Adapter: redis" },
      { type: "output", text: "Host: host:6379" },
      { type: "blank", text: "" },
      { type: "success", text: "Config saved. Run `ov auth login` to authenticate." },
    ],
    note: "Each entity type gets its own sorted-set index key for fast listing. No schema setup needed. Works with Upstash (serverless Redis), Redis Cloud, Redis Stack, and any ioredis-compatible endpoint — including TLS.",
  },
];

// ─── Steps Data ───────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: "install",
    number: 1,
    title: "Install the CLI",
    description:
      "Install Open Vault globally via Bun (recommended) or npm. The CLI binary is named `ov`.",
    terminalTitle: "install",
    lines: [
      { type: "comment", text: "# recommended — Bun" },
      { type: "prompt", text: "bun install -g @open-vault/cli" },
      { type: "blank", text: "" },
      { type: "comment", text: "# or npm" },
      { type: "prompt", text: "npx @open-vault/cli --help" },
      { type: "blank", text: "" },
      { type: "comment", text: "# verify" },
      { type: "prompt", text: "ov --version" },
      { type: "output", text: "open-vault/cli v1.0.0 (bun)" },
    ],
    note: "Requires Bun ≥ 1.0 or Node ≥ 20. No other dependencies.",
  },
  {
    id: "init",
    number: 2,
    title: "Initialize — choose a storage backend",
    description:
      "Run `ov auth init` once to configure where secrets are stored. The default adapter is `local` — no cloud account needed. Pass `--adapter` to choose S3, R2, Convex, Postgres, MySQL, or Redis instead. This writes a config file at `~/.config/open-vault/config.json`.",
    terminalTitle: "init",
    lines: [],
  },
  {
    id: "login",
    number: 3,
    title: "Login — SSH challenge-response",
    description:
      "Authenticate using your SSH private key. Open Vault issues a cryptographic challenge; you sign it locally. No password. No OAuth redirect. The private key never leaves your machine.",
    terminalTitle: "ov auth login",
    lines: [
      { type: "prompt", text: "ov auth login" },
      { type: "blank", text: "" },
      { type: "output", text: "Using key: ~/.ssh/id_ed25519 (ED25519)" },
      { type: "output", text: "Signing challenge..." },
      { type: "blank", text: "" },
      { type: "success", text: "Authenticated as alice@example.com" },
      { type: "output", text: "Session token saved to keychain." },
    ],
    note: "Supports ED25519 and RSA keys. If you have multiple keys, use --key ~/.ssh/id_rsa to specify.",
  },
  {
    id: "project",
    number: 4,
    title: "Create a project",
    description:
      "Projects are namespaced vaults. Use slash notation to group by app and environment: `myapp/prod`, `myapp/staging`, `team/infra`.",
    terminalTitle: "ov project create",
    lines: [
      { type: "prompt", text: "ov project create myapp/prod" },
      { type: "blank", text: "" },
      { type: "success", text: "Created project: myapp/prod" },
      { type: "blank", text: "" },
      { type: "comment", text: "# list your projects" },
      { type: "prompt", text: "ov project list" },
      { type: "output", text: "  myapp/prod      (owner)   0 secrets" },
    ],
  },
  {
    id: "set",
    number: 5,
    title: "Store a secret",
    description:
      "Secrets are encrypted client-side the moment you type them. The value is encrypted with your SSH-derived key using ChaCha20-Poly1305 before any network call.",
    terminalTitle: "ov secret set",
    lines: [
      { type: "prompt", text: "ov secret set DATABASE_URL --project myapp/prod" },
      { type: "output", text: "Enter value: ••••••••••••••••••••••••••••••••" },
      { type: "blank", text: "" },
      { type: "output", text: "Encrypting locally..." },
      { type: "success", text: "Uploaded ciphertext. Server stores zero plaintext." },
      { type: "blank", text: "" },
      { type: "comment", text: "# pipe a value directly" },
      { type: "prompt", text: "echo $MY_TOKEN | ov secret set API_TOKEN --project myapp/prod" },
      { type: "success", text: "Encrypted and uploaded." },
    ],
    note: "Values typed interactively are never written to shell history. Piped values bypass the prompt.",
  },
  {
    id: "get",
    number: 6,
    title: "Retrieve a secret",
    description:
      "Fetch a single secret by name. The ciphertext is downloaded, decrypted locally with your SSH key, and printed to stdout.",
    terminalTitle: "ov secret get",
    lines: [
      { type: "prompt", text: "ov secret get DATABASE_URL --project myapp/prod" },
      { type: "success", text: "postgres://alice:hunter2@db.example.com:5432/mydb" },
      { type: "blank", text: "" },
      { type: "comment", text: "# inject into a subprocess" },
      { type: "prompt", text: "DATABASE_URL=$(ov secret get DATABASE_URL --project myapp/prod) node server.js" },
    ],
  },
  {
    id: "export",
    number: 7,
    title: "Export as .env",
    description:
      "Export all secrets in a project as a `.env` file. Decryption happens client-side; the exported file lives only on your disk.",
    terminalTitle: "ov secret export",
    lines: [
      { type: "prompt", text: "ov secret export --project myapp/prod --output .env" },
      { type: "blank", text: "" },
      { type: "output", text: "Decrypting 12 secrets..." },
      { type: "success", text: "Written to .env (12 entries)" },
      { type: "blank", text: "" },
      { type: "comment", text: "# print to stdout without writing" },
      { type: "prompt", text: "ov secret export --project myapp/prod" },
      { type: "output", text: "DATABASE_URL=postgres://..." },
      { type: "output", text: "REDIS_URL=redis://..." },
      { type: "output", text: "API_TOKEN=sk-..." },
    ],
    note: "Add .env to your .gitignore. Never commit exported secrets.",
  },
  {
    id: "share",
    number: 8,
    title: "Share a secret (time-limited)",
    description:
      "Generate a one-time share link for any secret. The decryption key is appended as a URL fragment — it never reaches the server. Set an expiry and a maximum view count.",
    terminalTitle: "ov share create",
    lines: [
      { type: "prompt", text: "ov share create DATABASE_URL --project myapp/prod --expires 1h --views 1" },
      { type: "blank", text: "" },
      { type: "output", text: "Generating share envelope..." },
      { type: "output", text: "Encrypting to share key..." },
      { type: "blank", text: "" },
      { type: "success", text: "https://app.example.com/share/sh_k9x2m#key=dGhpcyBrZXkgbmV2ZXI=" },
      { type: "blank", text: "" },
      { type: "comment", text: "# the #key= fragment never touches the server" },
      { type: "comment", text: "# link expires: 1 hour  |  max views: 1" },
    ],
    note: "The key fragment is derived via age-encryption. Even if someone captures the share URL without the fragment, they cannot decrypt the payload.",
  },
  {
    id: "tui",
    number: 9,
    title: "(Optional) Launch the TUI",
    description:
      "For a full interactive experience, launch the built-in terminal UI. Browse projects, manage secrets, inspect version history — all inside your terminal.",
    terminalTitle: "ov ui",
    lines: [
      { type: "prompt", text: "ov ui" },
      { type: "blank", text: "" },
      { type: "output", text: "  Open Vault — TUI v1.0.0" },
      { type: "output", text: "  ┌─────────────────────────────────┐" },
      { type: "output", text: "  │  Projects       Secrets         │" },
      { type: "output", text: "  │  ─────────────  ─────────────── │" },
      { type: "output", text: "  │  myapp/prod  >  DATABASE_URL    │" },
      { type: "output", text: "  │  myapp/staging  REDIS_URL       │" },
      { type: "output", text: "  │                 API_TOKEN       │" },
      { type: "output", text: "  └─────────────────────────────────┘" },
      { type: "output", text: "  [j/k] navigate  [Enter] view  [q] quit" },
    ],
  },
];

const TOC: TocEntry[] = STEPS.map((s) => ({
  id: s.id,
  label: s.title,
  step: s.number,
}));

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ lines }: { lines: CodeLine[] }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const text = lines
      .filter((l) => l.type === "prompt")
      .map((l) => l.text)
      .join("\n");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button className="mk-copy-btn" onClick={handleCopy} aria-label="Copy commands">
      {copied ? (
        <span style={{ color: "var(--mk-accent)", display: "flex", alignItems: "center", gap: 4 }}>
          <IconCheck /> copied
        </span>
      ) : (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconCopy /> copy
        </span>
      )}
    </button>
  );
}

// ─── Terminal Block ───────────────────────────────────────────────────────────

function TerminalBlock({ lines, title }: { lines: CodeLine[]; title?: string }) {
  return (
    <div className="mk-terminal mk-scanlines" style={{ position: "relative" }}>
      <div className="mk-terminal-chrome">
        <span className="mk-dot mk-dot-close" />
        <span className="mk-dot mk-dot-min" />
        <span className="mk-dot mk-dot-max" />
        {title && <span className="mk-terminal-title">{title}</span>}
      </div>
      <div className="mk-terminal-body">
        {lines.map((line, i) => {
          if (line.type === "blank") {
            return <div key={i} style={{ height: 6 }} />;
          }
          if (line.type === "comment") {
            return (
              <div key={i}>
                <span className="mk-comment">{line.text}</span>
              </div>
            );
          }
          if (line.type === "prompt") {
            return (
              <div key={i}>
                <span className="mk-prompt">$ </span>
                <span className="mk-cmd">{line.text}</span>
              </div>
            );
          }
          if (line.type === "success") {
            return (
              <div key={i} style={{ color: "var(--mk-accent)" }}>
                {line.text}
              </div>
            );
          }
          // output
          return (
            <div key={i} className="mk-output">
              {line.text}
            </div>
          );
        })}
      </div>
      <CopyButton lines={lines} />
    </div>
  );
}

// ─── Note Callout ─────────────────────────────────────────────────────────────

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 16px",
        background: "rgba(16,185,129,0.06)",
        border: "1px solid rgba(16,185,129,0.18)",
        borderRadius: 8,
        marginTop: 16,
      }}
    >
      <span style={{ color: "var(--mk-accent)", flexShrink: 0, marginTop: 1 }}>
        <IconInfo />
      </span>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.8125rem",
          color: "var(--mk-muted)",
          lineHeight: 1.7,
          margin: 0,
        }}
      >
        {children}
      </p>
    </div>
  );
}

// ─── Adapter Selector ─────────────────────────────────────────────────────────

function ComplexityBadge({ complexity }: { complexity: AdapterConfig["complexity"] }) {
  const styles: Record<AdapterConfig["complexity"], { bg: string; color: string }> = {
    "Zero config": { bg: "rgba(16,185,129,0.15)", color: "var(--mk-accent)" },
    "Low": { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
    "Medium": { bg: "rgba(245,158,11,0.15)", color: "#fbbf24" },
    "High": { bg: "rgba(239,68,68,0.15)", color: "#f87171" },
  };
  const { bg, color } = styles[complexity];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 24 }}>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.625rem",
          letterSpacing: "0.14em",
          color: "var(--mk-muted)",
          textTransform: "uppercase",
        }}
      >
        Complexity
      </span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.6875rem",
          letterSpacing: "0.06em",
          background: bg,
          color,
          border: `1px solid ${color}44`,
          borderRadius: 4,
          padding: "3px 8px",
        }}
      >
        {complexity}
      </span>
    </div>
  );
}

function AdapterSelector() {
  const [activeId, setActiveId] = useState<AdapterConfig["id"]>("local");
  const [visible, setVisible] = useState(true);

  function selectAdapter(id: AdapterConfig["id"]) {
    if (id === activeId) return;
    setVisible(false);
    setTimeout(() => {
      setActiveId(id);
      setVisible(true);
    }, 120);
  }

  const adapter = ADAPTER_CONFIGS.find((a) => a.id === activeId)!;

  return (
    <div
      style={{
        background: "var(--mk-surface)",
        border: "1px solid var(--mk-border-strong)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--mk-border)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {ADAPTER_CONFIGS.map((cfg) => {
          const isActive = cfg.id === activeId;
          return (
            <button
              key={cfg.id}
              onClick={() => selectAdapter(cfg.id)}
              style={{
                padding: "12px 20px",
                fontFamily: "var(--font-display)",
                fontSize: "0.8125rem",
                letterSpacing: "0.04em",
                border: "none",
                cursor: "pointer",
                position: "relative",
                background: isActive ? "var(--mk-surface)" : "transparent",
                color: isActive ? "var(--mk-text)" : "var(--mk-muted)",
                boxShadow: isActive ? "inset 0 -3px 0 var(--mk-accent)" : "none",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = "var(--mk-text)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = "var(--mk-muted)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              {cfg.label}
              {cfg.isDefault && (
                <span
                  style={{
                    fontSize: "0.5rem",
                    letterSpacing: "0.1em",
                    background: "rgba(16,185,129,0.15)",
                    color: "var(--mk-accent)",
                    border: "1px solid rgba(16,185,129,0.3)",
                    borderRadius: 3,
                    padding: "2px 5px",
                    lineHeight: 1,
                  }}
                >
                  DEFAULT
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content area */}
      <div
        style={{
          padding: "28px 32px",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 32,
          alignItems: "start",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.12s ease",
        }}
      >
        {/* Left — meta panel */}
        <div>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.9375rem",
              color: "var(--mk-text)",
              lineHeight: 1.65,
              marginBottom: 24,
            }}
          >
            {adapter.tagline}
          </p>

          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.625rem",
              letterSpacing: "0.14em",
              color: "var(--mk-muted)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Requirements
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {adapter.requirements.map((req) => (
              <div
                key={req}
                style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: "rgba(16,185,129,0.12)",
                    border: "1px solid rgba(16,185,129,0.25)",
                    color: "var(--mk-accent)",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <IconCheck />
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.8125rem",
                    color: "var(--mk-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {req}
                </span>
              </div>
            ))}
          </div>

          {adapter.envVars && (
            <div
              style={{
                background: "rgba(0,0,0,0.2)",
                borderRadius: 6,
                padding: "10px 12px",
                marginTop: 16,
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.625rem",
                  letterSpacing: "0.14em",
                  color: "var(--mk-muted)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Env vars
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {adapter.envVars.map((v) => (
                  <span
                    key={v.name}
                    style={{
                      fontFamily: "var(--font-code)",
                      fontSize: "0.75rem",
                      color: "#8b949e",
                    }}
                  >
                    {v.name}=&lt;{v.hint}&gt;
                  </span>
                ))}
              </div>
            </div>
          )}

          <ComplexityBadge complexity={adapter.complexity} />
        </div>

        {/* Right — terminal + note */}
        <div>
          <TerminalBlock lines={adapter.lines} title={`ov auth init${adapter.id !== "local" ? ` --adapter ${adapter.id}` : ""}`} />
          <Note>{adapter.note}</Note>
        </div>
      </div>
    </div>
  );
}

// ─── Sticky ToC ───────────────────────────────────────────────────────────────

function TableOfContents({ activeId }: { activeId: string }) {
  return (
    <nav
      style={{
        position: "sticky",
        top: 80,
        padding: "24px 0",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.625rem",
          letterSpacing: "0.15em",
          color: "var(--mk-muted)",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        On this page
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {TOC.map((entry) => (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            className={`mk-toc-link${activeId === entry.id ? " active" : ""}`}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.5625rem",
                color: "inherit",
                opacity: 0.6,
                marginRight: 6,
              }}
            >
              {String(entry.step).padStart(2, "0")}
            </span>
            {entry.label}
          </a>
        ))}
      </div>

      <div style={{ marginTop: 32 }} />
      <div className="mk-divider" />
      <div style={{ marginTop: 24 }}>
        <a
          href="https://github.com/open-vault"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
            color: "var(--mk-muted)",
            textDecoration: "none",
            transition: "color 0.2s ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--mk-text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--mk-muted)"; }}
        >
          <IconGithub /> View on GitHub
        </a>
      </div>
    </nav>
  );
}

// ─── Step Section ─────────────────────────────────────────────────────────────

function StepSection({ step }: { step: Step }) {
  return (
    <section
      id={step.id}
      style={{
        paddingTop: 72,
        paddingBottom: 72,
        borderBottom: "1px solid var(--mk-border)",
        scrollMarginTop: 80,
      }}
    >
      {/* Step header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 32 }}>
        {/* Number */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div className="mk-step-marker">
            {String(step.number).padStart(2, "0")}
          </div>
          {step.number < STEPS.length && (
            <div className="mk-step-line" style={{ height: "calc(100% + 80px)" }} />
          )}
        </div>

        {/* Title block */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.5625rem",
              letterSpacing: "0.14em",
              color: "var(--mk-accent)",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Step {String(step.number).padStart(2, "0")}
            {step.number === STEPS.length && " — optional"}
          </div>
          <h2
            className="mk-display-sm"
            style={{
              fontSize: "1.375rem",
              color: "var(--mk-text)",
              marginBottom: 12,
            }}
          >
            {step.title}
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.9375rem",
              color: "var(--mk-muted)",
              lineHeight: 1.75,
              maxWidth: 640,
            }}
          >
            {step.description}
          </p>
        </div>
      </div>

      {/* Terminal or special renderer */}
      <div style={{ marginLeft: 48 }}>
        {step.id === "init" ? (
          <AdapterSelector />
        ) : (
          <>
            <TerminalBlock lines={step.lines} title={step.terminalTitle} />
            {step.note && <Note>{step.note}</Note>}
          </>
        )}
      </div>
    </section>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function QuickstartNav() {
  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: "1px solid var(--mk-border)",
        background: "rgba(8,11,15,0.92)",
        backdropFilter: "blur(20px)",
        height: 60,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                background: "rgba(16,185,129,0.12)",
                border: "1px solid rgba(16,185,129,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--mk-accent)",
              }}
            >
              <IconLock />
            </div>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "0.8125rem",
                color: "var(--mk-muted)",
                letterSpacing: "0.04em",
              }}
            >
              open-vault
            </span>
          </Link>

          <span
            style={{
              color: "var(--mk-border-strong)",
              fontFamily: "var(--font-code)",
              fontSize: "0.875rem",
            }}
          >
            /
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "0.8125rem",
              color: "var(--mk-text)",
              letterSpacing: "0.04em",
            }}
          >
            quickstart
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="#install" className="mk-nav-link">Jump to install</a>
          <Link href="/dashboard" className="mk-btn-primary" style={{ fontSize: "0.75rem", padding: "7px 14px" }}>
            Open Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuickstartPage() {
  const [activeId, setActiveId] = useState<string>("install");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sections = STEPS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-60px 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="mk-root">
      <QuickstartNav />

      {/* Hero */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "80px 24px 0",
        }}
      >
        <div
          style={{
            paddingTop: 60,
            paddingBottom: 64,
            borderBottom: "1px solid var(--mk-border)",
          }}
        >
          <div className="mk-animate-1" style={{ marginBottom: 20 }}>
            <span className="mk-badge">
              <span className="mk-badge-dot" />
              Quickstart guide
            </span>
          </div>

          <h1
            className="mk-display mk-animate-2"
            style={{
              fontSize: "clamp(2rem, 4vw, 3rem)",
              color: "var(--mk-text)",
              marginBottom: 20,
              maxWidth: 700,
            }}
          >
            Get running in{" "}
            <span className="mk-gradient-text">under two minutes</span>.
          </h1>

          <p
            className="mk-animate-3"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "1rem",
              color: "var(--mk-muted)",
              lineHeight: 1.75,
              maxWidth: 580,
              marginBottom: 32,
            }}
          >
            This guide walks through the full Open Vault CLI workflow —
            from installation to storing, retrieving, exporting, and sharing
            secrets — all encrypted client-side with your SSH key.
          </p>

          {/* Prerequisites strip */}
          <div
            className="mk-animate-4"
            style={{
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Bun ≥ 1.0 or Node ≥ 20", check: true },
              { label: "An SSH key (ED25519 or RSA)", check: true },
              { label: "A storage backend: local disk, S3, R2, or Convex", check: true },
            ].map(({ label, check }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: "var(--font-body)",
                  fontSize: "0.875rem",
                  color: "var(--mk-muted)",
                }}
              >
                {check && (
                  <span
                    style={{
                      display: "inline-flex",
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.25)",
                      color: "var(--mk-accent)",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconCheck />
                  </span>
                )}
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Two-column layout: content + sticky ToC */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 220px",
            gap: 80,
            alignItems: "start",
          }}
        >
          {/* Main content */}
          <main>
            {STEPS.map((step) => (
              <StepSection key={step.id} step={step} />
            ))}

            {/* Next steps */}
            <section style={{ paddingTop: 72, paddingBottom: 80 }}>
              <p className="mk-label" style={{ marginBottom: 20 }}>You're set</p>
              <h2
                className="mk-display-sm"
                style={{
                  fontSize: "1.5rem",
                  color: "var(--mk-text)",
                  marginBottom: 12,
                }}
              >
                What's next?
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  color: "var(--mk-muted)",
                  lineHeight: 1.75,
                  fontSize: "0.9375rem",
                  marginBottom: 32,
                }}
              >
                You have a working setup. Explore team vaults, audit logs,
                and version history from the web dashboard.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 12,
                }}
              >
                {[
                  {
                    title: "Web Dashboard",
                    desc: "Manage secrets visually, invite team members, view audit trails.",
                    href: "/dashboard",
                    label: "Open dashboard",
                  },
                  {
                    title: "CLI Reference",
                    desc: "Full command reference with flags, options, and examples.",
                    href: "https://github.com/open-vault/cli",
                    label: "View reference",
                  },
                ].map((card) => (
                  <a
                    key={card.title}
                    href={card.href}
                    className="mk-card"
                    style={{ textDecoration: "none" }}
                  >
                    <h3
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "0.9375rem",
                        color: "var(--mk-text)",
                        marginBottom: 8,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {card.title}
                    </h3>
                    <p
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "0.875rem",
                        color: "var(--mk-muted)",
                        lineHeight: 1.65,
                        marginBottom: 16,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {card.desc}
                    </p>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontFamily: "var(--font-display)",
                        fontSize: "0.75rem",
                        color: "var(--mk-accent)",
                        letterSpacing: "0.04em",
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      {card.label} <IconArrow />
                    </span>
                  </a>
                ))}
              </div>
            </section>
          </main>

          {/* ToC sidebar */}
          <aside>
            <TableOfContents activeId={activeId} />
          </aside>
        </div>
      </div>
    </div>
  );
}
