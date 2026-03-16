"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import "./marketing.css";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface QuickstepItem {
  cmd: string;
  comment?: string;
  output?: string;
}

// ─── Icons (inline SVG — no extra dep) ───────────────────────────────────────

function IconLock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconKey() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5"/>
      <path d="m21 2-9.6 9.6"/>
      <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    </svg>
  );
}

function IconShare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/>
      <circle cx="6" cy="12" r="3"/>
      <circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-5.25"/>
      <polyline points="12 7 12 12 15 15"/>
    </svg>
  );
}

function IconAdapters() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v4c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      <path d="M3 9v4c0 1.66 4.03 3 9 3s9-1.34 9-3V9"/>
      <path d="M3 13v4c0 1.66 4.03 3 9 3s9-1.34 9-3v-4"/>
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function IconGithub() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

// ─── Copy Button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button className="mk-copy-btn" onClick={handleCopy} aria-label="Copy to clipboard">
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

// ─── Terminal Window ──────────────────────────────────────────────────────────

function Terminal({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mk-terminal mk-scanlines">
      <div className="mk-terminal-chrome">
        <span className="mk-dot mk-dot-close" />
        <span className="mk-dot mk-dot-min" />
        <span className="mk-dot mk-dot-max" />
        {title && <span className="mk-terminal-title">{title}</span>}
      </div>
      <div className="mk-terminal-body">{children}</div>
    </div>
  );
}

// ─── Features Data ────────────────────────────────────────────────────────────

const FEATURES: Feature[] = [
  {
    icon: <IconLock />,
    title: "End-to-end encrypted",
    description: "Secrets are encrypted client-side before leaving your machine. The server stores only ciphertext — no plaintext ever touches the network.",
  },
  {
    icon: <IconKey />,
    title: "SSH identity",
    description: "No passwords to remember, no accounts to create. Authentication is a cryptographic challenge-response using your existing SSH private key.",
  },
  {
    icon: <IconShare />,
    title: "One-time share links",
    description: "Share any secret via a time-limited URL. The decryption key lives only in the URL fragment — the server is blind to it by design.",
  },
  {
    icon: <IconUsers />,
    title: "Team vaults",
    description: "Create shared projects with role-based access. Each member's copy is encrypted to their own SSH key — no shared master password.",
  },
  {
    icon: <IconTerminal />,
    title: "CLI-first",
    description: "Full-featured CLI with a TUI mode. Export directly to .env, inject into shell sessions, or pipe to any tool in your workflow.",
  },
  {
    icon: <IconHistory />,
    title: "Version history",
    description: "Every secret mutation is stored. Roll back to any previous value, audit who changed what, and recover from accidents instantly.",
  },
  {
    icon: <IconAdapters />,
    title: "Pluggable backends",
    description: "Store secrets anywhere — local disk, S3, R2, Convex, Postgres, MySQL, or Redis. Switch adapters without changing your workflow.",
  },
];

// ─── How It Works ─────────────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Your SSH key",
    description: "Open Vault derives an encryption key from your SSH private key. Never leaves your machine.",
    accent: "rgba(16,185,129,0.12)",
  },
  {
    step: "02",
    title: "Encrypted locally",
    description: "Every secret is encrypted in-process before any network call. We use ChaCha20-Poly1305 with age-encryption.",
    accent: "rgba(16,185,129,0.08)",
  },
  {
    step: "03",
    title: "Ciphertext only",
    description: "The server receives — and stores — only ciphertext. Even a full database compromise yields nothing readable.",
    accent: "rgba(16,185,129,0.05)",
  },
];

// ─── Quickstart Steps (homepage preview) ─────────────────────────────────────

const QUICKSTEPS: QuickstepItem[] = [
  { cmd: "bun install -g @open-vault/cli", comment: "install once" },
  { cmd: "ov auth init --adapter local", comment: "local is the default — no cloud needed" },
  { cmd: "ov auth login", output: "Authenticated as alice@example.com (ED25519)" },
  { cmd: "ov project create myapp/prod" },
  { cmd: "ov secret set DATABASE_URL --project myapp/prod", output: "Enter value: [hidden]  Encrypted locally. Uploaded." },
  { cmd: "ov secret get DATABASE_URL --project myapp/prod", output: "postgres://user:pass@host:5432/mydb" },
];

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 20); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: `1px solid ${scrolled ? "var(--mk-border-strong)" : "transparent"}`,
        background: scrolled ? "rgba(8,11,15,0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        transition: "background 0.3s ease, border-color 0.3s ease",
      }}
    >
      <nav
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
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
              fontSize: "0.875rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--mk-text)",
            }}
          >
            open-vault
          </span>
        </div>

        {/* Links */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <a href="#how-it-works" className="mk-nav-link">How it works</a>
          <a href="#features" className="mk-nav-link">Features</a>
          <Link href="/quickstart" className="mk-nav-link">Quickstart</Link>
          <a
            href="https://github.com/open-vault"
            target="_blank"
            rel="noopener noreferrer"
            className="mk-nav-link"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <IconGithub />
          </a>
          <Link href="/dashboard" className="mk-btn-primary" style={{ fontSize: "0.75rem", padding: "8px 16px" }}>
            Open Dashboard
          </Link>
        </div>
      </nav>
    </header>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        padding: "120px 24px 80px",
        maxWidth: 1200,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* Background orbs */}
      <div
        className="mk-orb"
        style={{
          width: 600,
          height: 600,
          background: "radial-gradient(ellipse, rgba(16,185,129,0.07) 0%, transparent 70%)",
          top: "10%",
          left: "-15%",
        }}
      />
      <div
        className="mk-orb"
        style={{
          width: 400,
          height: 400,
          background: "radial-gradient(ellipse, rgba(57,211,83,0.04) 0%, transparent 70%)",
          top: "40%",
          right: "-5%",
        }}
      />

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 80,
          alignItems: "center",
          width: "100%",
        }}
      >
        {/* Left — headline */}
        <div>
          <div className="mk-animate-1" style={{ marginBottom: 28 }}>
            <span className="mk-badge">
              <span className="mk-badge-dot" />
              End-to-end encrypted
            </span>
          </div>

          <h1
            className="mk-display mk-animate-2"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
              color: "var(--mk-text)",
              marginBottom: 24,
            }}
          >
            Secrets the{" "}
            <span className="mk-gradient-text">server never sees</span>.
          </h1>

          <p
            className="mk-animate-3"
            style={{
              fontSize: "1.0625rem",
              color: "var(--mk-muted)",
              lineHeight: 1.75,
              marginBottom: 40,
              fontFamily: "var(--font-body)",
              maxWidth: 460,
            }}
          >
            Open Vault encrypts every credential client-side using your SSH
            private key — before it touches the network. The backend stores only
            ciphertext. Zero trust. Zero compromise.
          </p>

          <div className="mk-animate-4" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/quickstart" className="mk-btn-primary">
              Get started <IconArrow />
            </Link>
            <a href="#how-it-works" className="mk-btn-ghost">
              See how it works
            </a>
          </div>
        </div>

        {/* Right — terminal */}
        <div className="mk-animate-5">
          <Terminal title="~ open-vault">
            <div style={{ marginBottom: 4 }}>
              <span className="mk-comment"># one-time install</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span className="mk-prompt">$ </span>
              <span className="mk-cmd">bun install -g @open-vault/cli</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <span className="mk-comment"># authenticate with your SSH key</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <span className="mk-prompt">$ </span>
              <span className="mk-cmd">ov auth login</span>
            </div>
            <div style={{ marginBottom: 12, color: "#8b949e" }}>
              Authenticated as <span style={{ color: "var(--mk-accent)" }}>alice@example.com</span> (ED25519)
            </div>
            <div style={{ marginBottom: 4 }}>
              <span className="mk-comment"># store a secret — encrypted locally</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <span className="mk-prompt">$ </span>
              <span className="mk-cmd">ov secret set DATABASE_URL <span style={{ color: "#a5d6ff" }}>--project myapp/prod</span></span>
            </div>
            <div style={{ marginBottom: 12, color: "#8b949e" }}>
              Enter value: <span style={{ color: "var(--mk-muted)" }}>••••••••••••••••••</span>
            </div>
            <div style={{ color: "var(--mk-accent)" }}>
              Encrypted locally. Uploaded ciphertext. Done.
            </div>
            <div style={{ marginTop: 12 }}>
              <span className="mk-prompt">$ </span>
              <span className="mk-cursor" />
            </div>
          </Terminal>

          {/* Stat strip */}
          <div
            style={{
              display: "flex",
              gap: 24,
              marginTop: 20,
              padding: "16px 20px",
              background: "var(--mk-surface)",
              border: "1px solid var(--mk-border)",
              borderRadius: 8,
            }}
          >
            {[
              { label: "plaintext on server", value: "zero" },
              { label: "encryption", value: "ChaCha20" },
              { label: "identity", value: "SSH ED25519" },
              { label: "storage adapters", value: "7" },
            ].map(({ label, value }) => (
              <div key={label} style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.9375rem",
                    color: "var(--mk-text)",
                    marginBottom: 2,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.6875rem",
                    color: "var(--mk-muted)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{
        padding: "100px 24px",
        borderTop: "1px solid var(--mk-border)",
        background: `linear-gradient(to bottom, var(--mk-bg), var(--mk-surface))`,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 72 }}>
          <p className="mk-label" style={{ marginBottom: 16 }}>Architecture</p>
          <h2
            className="mk-display-sm"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", color: "var(--mk-text)", marginBottom: 16 }}
          >
            How the encryption works
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--mk-muted)",
              maxWidth: 520,
              margin: "0 auto",
              lineHeight: 1.7,
              fontSize: "0.9375rem",
            }}
          >
            A three-step process designed so that even a fully compromised
            server reveals nothing.
          </p>
        </div>

        {/* Step flow */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 0,
          }}
        >
          {HOW_IT_WORKS.map((item, idx) => (
            <div key={item.step} style={{ display: "flex", alignItems: "flex-start", flex: 1 }}>
              {/* Card */}
              <div
                style={{
                  flex: 1,
                  background: "var(--mk-surface)",
                  border: "1px solid var(--mk-border-strong)",
                  borderRadius: 12,
                  padding: "32px 28px",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: `inset 0 0 40px ${item.accent}`,
                }}
              >
                {/* Step watermark */}
                <span className="mk-step-number">{item.step}</span>

                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.6875rem",
                    letterSpacing: "0.12em",
                    color: "var(--mk-accent)",
                    marginBottom: 12,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  STEP {item.step}
                </div>
                <h3
                  className="mk-display-sm"
                  style={{
                    fontSize: "1.125rem",
                    color: "var(--mk-text)",
                    marginBottom: 12,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    color: "var(--mk-muted)",
                    lineHeight: 1.7,
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {item.description}
                </p>
              </div>

              {/* Connector arrow between cards */}
              {idx < HOW_IT_WORKS.length - 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 16px",
                    marginTop: 48,
                    color: "rgba(16,185,129,0.4)",
                    flexShrink: 0,
                  }}
                >
                  <IconArrow />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Features Grid ────────────────────────────────────────────────────────────

function Features() {
  return (
    <section
      id="features"
      style={{
        padding: "100px 24px",
        background: "var(--mk-surface)",
        borderTop: "1px solid var(--mk-border)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <p className="mk-label" style={{ marginBottom: 16 }}>Capabilities</p>
          <h2
            className="mk-display-sm"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.5rem)", color: "var(--mk-text)" }}
          >
            Everything you need. Nothing you don't.
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {FEATURES.map((feature) => (
            <div key={feature.title} className="mk-card">
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: "rgba(16,185,129,0.1)",
                  color: "var(--mk-accent)",
                  marginBottom: 16,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {feature.icon}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "0.9375rem",
                  color: "var(--mk-text)",
                  marginBottom: 8,
                  letterSpacing: "-0.01em",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {feature.title}
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.875rem",
                  color: "var(--mk-muted)",
                  lineHeight: 1.7,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Quickstart Preview ───────────────────────────────────────────────────────

function QuickstartPreview() {
  return (
    <section
      style={{
        padding: "100px 24px",
        borderTop: "1px solid var(--mk-border)",
        background: "var(--mk-bg)",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "start",
          }}
        >
          {/* Left — copy */}
          <div style={{ paddingTop: 12 }}>
            <p className="mk-label" style={{ marginBottom: 16 }}>Quickstart</p>
            <h2
              className="mk-display-sm"
              style={{
                fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
                color: "var(--mk-text)",
                marginBottom: 20,
              }}
            >
              From zero to encrypted in under two minutes.
            </h2>
            <p
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--mk-muted)",
                lineHeight: 1.75,
                marginBottom: 36,
                fontSize: "0.9375rem",
              }}
            >
              If you have an SSH key, you already have everything you need.
              No account creation. No browser OAuth flow. Just a
              challenge-response and you're in.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}>
              {[
                "Install the CLI with Bun or npm",
                "Choose a storage backend (local, S3, R2, Convex, Postgres, MySQL, or Redis)",
                "Authenticate via SSH challenge",
                "Start storing, sharing, and exporting secrets",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--mk-accent)",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <IconCheck />
                  </div>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "0.9375rem", color: "var(--mk-text)", lineHeight: 1.5 }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <Link href="/quickstart" className="mk-btn-primary">
              Full quickstart guide <IconArrow />
            </Link>
          </div>

          {/* Right — terminal walkthrough */}
          <div style={{ position: "relative" }}>
            <Terminal title="ov — quickstart walkthrough">
              {QUICKSTEPS.map((step, idx) => (
                <div key={idx} style={{ marginBottom: idx < QUICKSTEPS.length - 1 ? 14 : 0 }}>
                  {step.comment && (
                    <div style={{ marginBottom: 2 }}>
                      <span className="mk-comment"># {step.comment}</span>
                    </div>
                  )}
                  <div>
                    <span className="mk-prompt">$ </span>
                    <span className="mk-cmd">{step.cmd}</span>
                  </div>
                  {step.output && (
                    <div style={{ color: "var(--mk-success)", marginTop: 2, paddingLeft: 14 }}>
                      {step.output}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <span className="mk-prompt">$ </span>
                <span className="mk-cursor" />
              </div>
            </Terminal>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── CTA Banner ───────────────────────────────────────────────────────────────

function CtaBanner() {
  return (
    <section
      style={{
        padding: "80px 24px",
        borderTop: "1px solid var(--mk-border)",
        background: "linear-gradient(to bottom, var(--mk-surface), var(--mk-bg))",
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64,
            height: 64,
            borderRadius: 14,
            background: "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.25)",
            color: "var(--mk-accent)",
            marginBottom: 32,
            boxShadow: "0 0 40px rgba(16,185,129,0.15)",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <h2
          className="mk-display-sm"
          style={{
            fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
            color: "var(--mk-text)",
            marginBottom: 16,
          }}
        >
          Your secrets belong to you.
        </h2>
        <p
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--mk-muted)",
            fontSize: "1rem",
            lineHeight: 1.7,
            marginBottom: 40,
          }}
        >
          Open source. Self-hostable. End-to-end encrypted by default.
          No subscription required to keep your secrets private.
        </p>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/quickstart" className="mk-btn-primary">
            Get started free <IconArrow />
          </Link>
          <a
            href="https://github.com/open-vault"
            target="_blank"
            rel="noopener noreferrer"
            className="mk-btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <IconGithub /> View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--mk-border)",
        background: "var(--mk-bg)",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <span style={{ color: "var(--mk-border-strong)", fontSize: "0.75rem" }}>—</span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.8125rem",
              color: "var(--mk-muted)",
            }}
          >
            End-to-end encrypted secrets manager
          </span>
        </div>

        <div style={{ display: "flex", gap: 28 }}>
          {[
            { label: "Quickstart", href: "/quickstart" },
            { label: "Dashboard", href: "/dashboard" },
            { label: "GitHub", href: "https://github.com/open-vault" },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="mk-nav-link"
              style={{ fontSize: "0.8125rem" }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  return (
    <div className="mk-root">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <QuickstartPreview />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
