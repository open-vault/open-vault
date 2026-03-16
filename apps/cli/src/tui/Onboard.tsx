import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { AdapterType, Config } from "../lib/config.js";

// ─── Adapter field definitions ────────────────────────────────────────────────

interface AdapterField {
  key: keyof Config;
  label: string;
  hint: string;
  required: boolean;
  secret?: boolean;
}

const ADAPTER_FIELDS: Record<AdapterType, AdapterField[]> = {
  local: [],
  s3: [
    { key: "s3Bucket",         label: "S3 bucket name",   hint: "my-vault",                     required: true  },
    { key: "s3Region",         label: "AWS region",        hint: "us-east-1",                    required: false },
    { key: "s3AccessKeyId",    label: "Access Key ID",     hint: "AKIA… (optional, uses env vars if empty)", required: false },
    { key: "s3SecretAccessKey",label: "Secret Access Key", hint: "leave empty to use env vars",  required: false, secret: true },
    { key: "s3Prefix",         label: "Key prefix",        hint: "vault/",                       required: false },
  ],
  r2: [
    { key: "s3Bucket",         label: "R2 bucket name",   hint: "my-vault",                     required: true  },
    { key: "s3Endpoint",       label: "R2 endpoint",       hint: "https://<account-id>.r2.cloudflarestorage.com", required: true },
    { key: "s3AccessKeyId",    label: "Access Key ID",     hint: "from Cloudflare → R2 → Manage API tokens",  required: true  },
    { key: "s3SecretAccessKey",label: "Secret Access Key", hint: "from Cloudflare → R2 → Manage API tokens",  required: true,  secret: true },
    { key: "s3Prefix",         label: "Key prefix",        hint: "vault/",                       required: false },
  ],
  convex:   [{ key: "convexUrl",   label: "Convex URL",   hint: "https://xxx.convex.cloud",                required: true }],
  postgres: [{ key: "databaseUrl", label: "Database URL", hint: "postgres://user:pass@host:5432/db",       required: true }],
  mysql:    [{ key: "databaseUrl", label: "Database URL", hint: "mysql://user:pass@host:3306/db",          required: true }],
  redis:    [{ key: "redisUrl",    label: "Redis URL",    hint: "redis://user:pass@host:6379",             required: true }],
};

const ADAPTERS: AdapterType[] = ["local", "s3", "r2", "convex", "postgres", "mysql", "redis"];

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase =
  | "ssh-check"
  | "ssh-input"
  | "adapter-select"
  | "adapter-config"
  | "initializing"
  | "auth-confirm"       // session exists — keep or re-auth
  | "authenticating"
  | "project-input"
  | "project-creating"
  | "secret-name-input"
  | "secret-value-input"
  | "secret-storing"
  | "complete";

const AUTO_PHASES: Phase[] = ["ssh-check", "initializing", "authenticating", "project-creating", "secret-storing"];

interface WizardState {
  phase: Phase;
  // ssh
  sshKeyPath: string;
  // adapter
  adapter: AdapterType;
  adapterCursor: number;
  adapterFieldIndex: number;
  adapterFieldValues: Partial<Config>;
  adapterFieldDefaults: Partial<Config>;  // pre-loaded from existing config or env vars
  adapterFieldEnvSources: Record<string, string>; // key → env var name (when value came from env)
  // auth
  hasExistingSession: boolean;
  existingSessionExpiry: string | null;
  // text input shared across phases
  textInput: string;
  // project + secret
  projectId: string | null;
  secretName: string;
  // ui
  status: string | null;
  error: string | null;
}

// ─── Wizard hook ──────────────────────────────────────────────────────────────

function useOnboardWizard() {
  const { exit } = useApp();

  const [state, setState] = useState<WizardState>({
    phase: "ssh-check",
    sshKeyPath: "",
    adapter: "local",
    adapterCursor: 0,
    adapterFieldIndex: 0,
    adapterFieldValues: {},
    adapterFieldDefaults: {},
    adapterFieldEnvSources: {},
    hasExistingSession: false,
    existingSessionExpiry: null,
    textInput: "",
    projectId: null,
    secretName: "",
    status: null,
    error: null,
  });

  const set = useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  // ── ssh-check: load existing state, pre-populate, always go to ssh-input ──

  useEffect(() => {
    if (state.phase !== "ssh-check") return;

    async function run() {
      const { existsSync } = await import("fs");
      const { homedir } = await import("os");
      const { join } = await import("path");
      const { loadConfig } = await import("../lib/config.js");
      const { loadSession } = await import("../lib/session.js");

      const config = loadConfig();
      const session = loadSession();

      const defaultKey = join(homedir(), ".ssh", "id_ed25519");
      const resolvedKey = config.sshKeyPath ?? defaultKey;

      // Env var candidates for each config key
      const ENV_SOURCES: Partial<Record<keyof Config, string>> = {
        s3AccessKeyId:     "AWS_ACCESS_KEY_ID",
        s3SecretAccessKey: "AWS_SECRET_ACCESS_KEY",
        s3Region:          "AWS_DEFAULT_REGION",
        databaseUrl:       "DATABASE_URL",
        redisUrl:          "REDIS_URL",
        convexUrl:         "CONVEX_URL",
      };

      // Build defaults: prefer config, fall back to env var
      const adapterFieldDefaults: Partial<Config> = {
        s3Bucket:          config.s3Bucket,
        s3Region:          config.s3Region          ?? process.env.AWS_DEFAULT_REGION,
        s3Prefix:          config.s3Prefix,
        s3Endpoint:        config.s3Endpoint,
        s3AccessKeyId:     config.s3AccessKeyId     ?? process.env.AWS_ACCESS_KEY_ID,
        s3SecretAccessKey: config.s3SecretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY,
        convexUrl:         config.convexUrl          ?? process.env.CONVEX_URL,
        databaseUrl:       config.databaseUrl        ?? process.env.DATABASE_URL,
        redisUrl:          config.redisUrl            ?? process.env.REDIS_URL,
      };

      // Track which values came from env (not from config) so the UI can label them
      const adapterFieldEnvSources: Record<string, string> = {};
      for (const [key, envVar] of Object.entries(ENV_SOURCES) as [keyof Config, string][]) {
        if (!config[key] && process.env[envVar]) {
          adapterFieldEnvSources[key as string] = envVar;
        }
      }

      const existingAdapter = config.adapter ?? "local";

      set({
        phase: "ssh-input",
        sshKeyPath: resolvedKey,
        textInput: existsSync(resolvedKey + ".pub") ? resolvedKey : "",
        adapter: existingAdapter,
        adapterCursor: ADAPTERS.indexOf(existingAdapter),
        adapterFieldDefaults,
        adapterFieldEnvSources,
        adapterFieldValues: {},
        hasExistingSession: !!session,
        existingSessionExpiry: session?.expiresAt ?? null,
      });
    }

    void run();
  }, [state.phase]);

  // ── Pre-populate textInput when adapter-config field changes ───────────────

  useEffect(() => {
    if (state.phase !== "adapter-config") return;
    const fields = ADAPTER_FIELDS[state.adapter];
    if (!fields.length) return;
    const field = fields[state.adapterFieldIndex];
    const existing = (state.adapterFieldDefaults as Record<string, string>)[field.key as string] ?? "";
    set({ textInput: existing });
  }, [state.phase, state.adapter, state.adapterFieldIndex]);

  // ── initializing: save config ─────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "initializing") return;

    async function run() {
      const { loadConfig, saveConfig } = await import("../lib/config.js");
      const config = loadConfig();
      config.adapter = state.adapter;
      config.sshKeyPath = state.sshKeyPath;
      Object.assign(config, state.adapterFieldValues);
      saveConfig(config);

      const next: Phase = state.hasExistingSession ? "auth-confirm" : "authenticating";
      set({ phase: next, status: null });
    }

    void run();
  }, [state.phase]);

  // ── authenticating: SSH auth ──────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "authenticating") return;
    set({ status: "Authenticating…", error: null });

    async function run() {
      try {
        const { loadConfig, saveConfig } = await import("../lib/config.js");
        const { saveSession }            = await import("../lib/session.js");
        const { createAdapter }          = await import("../lib/adapter.js");
        const { getSSHPublicKey }        = await import("../lib/crypto.js");
        const { execSync }               = await import("child_process");
        const { writeFileSync, readFileSync, unlinkSync } = await import("fs");

        const config = loadConfig();
        const publicKey = getSSHPublicKey(config.sshKeyPath);
        const parts = publicKey.split(" ");
        const fingerprint = parts[0] + ":" + parts[1].slice(0, 16);

        let sign: ((c: string) => Promise<string>) | undefined;
        if (config.adapter === "convex") {
          sign = async (challenge) => {
            const tmp = `/tmp/ov-ob-${Date.now()}`;
            writeFileSync(tmp, challenge);
            execSync(`ssh-keygen -Y sign -f "${config.sshKeyPath ?? `${process.env.HOME}/.ssh/id_ed25519`}" -n "open-vault" "${tmp}" 2>/dev/null`);
            const sig = readFileSync(`${tmp}.sig`, "base64url");
            try { unlinkSync(tmp); } catch {}
            try { unlinkSync(`${tmp}.sig`); } catch {}
            return sig;
          };
        }

        const adapter = createAdapter(config);
        const { userId, token, expiresAt } = await adapter.authenticate({ publicKey, fingerprint, sign });
        saveSession({ token, userId, expiresAt });
        config.userId = userId;
        saveConfig(config);

        set({ phase: "project-input", status: null, hasExistingSession: true, existingSessionExpiry: expiresAt, textInput: "" });
      } catch (e: unknown) {
        set({ error: (e as Error).message, status: null, phase: "authenticating" });
      }
    }

    void run();
  }, [state.phase]);

  // ── project-creating ──────────────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "project-creating") return;
    const name = state.textInput.trim();
    if (!name) { set({ phase: "secret-name-input", textInput: "" }); return; }

    set({ status: `Creating "${name}"…` });

    async function run() {
      try {
        const { loadConfig }  = await import("../lib/config.js");
        const { loadSession } = await import("../lib/session.js");
        const { createAdapter } = await import("../lib/adapter.js");
        const config = loadConfig();
        const session = loadSession();
        if (!session) throw new Error("No session");
        const adapter = createAdapter(config);
        const project = await adapter.createProject(session.userId, { name });
        set({ phase: "secret-name-input", projectId: project.id, status: null, textInput: "" });
      } catch (e: unknown) {
        set({ error: (e as Error).message, status: null, phase: "project-input", textInput: "" });
      }
    }

    void run();
  }, [state.phase]);

  // ── secret-storing ────────────────────────────────────────────────────────

  useEffect(() => {
    if (state.phase !== "secret-storing") return;
    if (!state.projectId) { set({ phase: "complete", status: null }); return; }

    set({ status: "Encrypting and storing…" });

    async function run() {
      try {
        const { loadConfig }  = await import("../lib/config.js");
        const { loadSession } = await import("../lib/session.js");
        const { createAdapter }   = await import("../lib/adapter.js");
        const { deriveMasterKey, encryptValue } = await import("../lib/crypto.js");

        const config  = loadConfig();
        const session = loadSession();
        if (!session) throw new Error("No session");

        const masterKey = await deriveMasterKey(config.sshKeyPath);
        const encrypted = await encryptValue(masterKey, state.textInput);
        const adapter   = createAdapter(config);
        await adapter.createSecret(state.projectId!, session.userId, { name: state.secretName, type: "KV", ...encrypted });
        set({ phase: "complete", status: null });
      } catch (e: unknown) {
        set({ error: (e as Error).message, status: null, phase: "secret-name-input", textInput: "" });
      }
    }

    void run();
  }, [state.phase]);

  // ── Input handler ─────────────────────────────────────────────────────────

  useInput((input, key) => {
    if (key.escape) { exit(); return; }

    // Text helper
    const appendText = () => {
      if (key.backspace || key.delete) set({ textInput: state.textInput.slice(0, -1) });
      else if (input && !key.ctrl && !key.meta && !key.upArrow && !key.downArrow) set({ textInput: state.textInput + input });
    };

    switch (state.phase) {

      case "ssh-input": {
        if (key.return) {
          const p = state.textInput.trim();
          if (!p) return;
          set({ sshKeyPath: p, phase: "adapter-select", textInput: "" });
        } else appendText();
        break;
      }

      case "adapter-select": {
        if (key.upArrow)   set({ adapterCursor: Math.max(0, state.adapterCursor - 1) });
        if (key.downArrow) set({ adapterCursor: Math.min(ADAPTERS.length - 1, state.adapterCursor + 1) });
        if (key.return) {
          const adapter = ADAPTERS[state.adapterCursor];
          const fields  = ADAPTER_FIELDS[adapter];
          set({ adapter });
          if (fields.length === 0) set({ adapter, phase: "initializing" });
          else set({ adapter, phase: "adapter-config", adapterFieldIndex: 0, adapterFieldValues: {} });
        }
        break;
      }

      case "adapter-config": {
        const fields = ADAPTER_FIELDS[state.adapter];
        const field  = fields[state.adapterFieldIndex];
        if (key.return) {
          const val    = state.textInput.trim();
          if (field.required && !val) return;
          const newVals = { ...state.adapterFieldValues, [field.key]: val || undefined };
          if (state.adapterFieldIndex < fields.length - 1) {
            set({ adapterFieldValues: newVals, adapterFieldIndex: state.adapterFieldIndex + 1 });
          } else {
            set({ adapterFieldValues: newVals, phase: "initializing", textInput: "" });
          }
        } else appendText();
        break;
      }

      case "auth-confirm": {
        if (key.return) {
          // keep existing session
          set({ phase: "project-input", textInput: "" });
        } else if (input === "r" || input === "R") {
          // force re-authenticate
          set({ phase: "authenticating" });
        }
        break;
      }

      case "project-input": {
        if (key.return) {
          set({ phase: state.textInput.trim() ? "project-creating" : "complete" });
        } else appendText();
        break;
      }

      case "secret-name-input": {
        if (key.return) {
          const name = state.textInput.trim();
          if (!name) set({ phase: "complete" });
          else set({ secretName: name, phase: "secret-value-input", textInput: "" });
        } else appendText();
        break;
      }

      case "secret-value-input": {
        if (key.return) {
          if (state.textInput) set({ phase: "secret-storing" });
        } else appendText();
        break;
      }

      case "complete": {
        if (key.return || input === "q") exit();
        break;
      }
    }
  });

  return state;
}

// ─── Step list helpers ────────────────────────────────────────────────────────

const PHASE_ORDER: Phase[] = [
  "ssh-check", "ssh-input",
  "adapter-select", "adapter-config",
  "initializing", "auth-confirm", "authenticating",
  "project-input", "project-creating",
  "secret-name-input", "secret-value-input", "secret-storing",
  "complete",
];

function isPast(current: Phase, target: Phase) {
  return PHASE_ORDER.indexOf(current) > PHASE_ORDER.indexOf(target);
}

function isAt(current: Phase, ...targets: Phase[]) {
  return targets.includes(current);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Cursor({ text }: { text: string }) {
  return <Text>{text}<Text inverse> </Text></Text>;
}

function StepRow({ icon, label, sub, active, done }: {
  icon?: string; label: string; sub?: string; active: boolean; done: boolean;
}) {
  const bullet = done ? "✓" : active ? "▶" : "○";
  const color  = done ? "green" : active ? "cyan" : "gray";
  return (
    <Box gap={1}>
      <Text color={color}>{bullet}</Text>
      <Box flexDirection="column">
        <Text color={active ? "white" : done ? "green" : "gray"} dimColor={!active && !done}>{label}</Text>
        {sub && <Text dimColor color="gray">  {sub}</Text>}
      </Box>
    </Box>
  );
}

function InputRow({ label, value, placeholder }: { label: string; value: string; placeholder?: string }) {
  return (
    <Box gap={1} marginTop={1}>
      <Text color="gray">{label}:</Text>
      <Cursor text={value || ""} />
      {!value && placeholder && <Text dimColor color="gray">{placeholder}</Text>}
    </Box>
  );
}

function ExistingBadge({ value }: { value: string }) {
  return <Text dimColor color="gray"> (was: {value})</Text>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Onboard() {
  const s = useOnboardWizard();
  const isAuto = AUTO_PHASES.includes(s.phase);

  const sshDone     = isPast(s.phase, "ssh-input");
  const adapterDone = isPast(s.phase, "adapter-config") || (isPast(s.phase, "adapter-select") && ADAPTER_FIELDS[s.adapter].length === 0);
  const authDone    = isPast(s.phase, "authenticating") || isPast(s.phase, "auth-confirm");
  const projectDone = isPast(s.phase, "project-creating");
  const secretDone  = s.phase === "complete" && !!s.secretName;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={0}>

      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="green">Open Vault</Text>
        <Text color="gray"> — setup wizard  </Text>
        <Text dimColor color="gray">(esc to quit)</Text>
      </Box>

      {/* Progress */}
      <Box flexDirection="column" marginBottom={1}>
        <StepRow
          label={sshDone ? `SSH key: ${s.sshKeyPath}` : "SSH key"}
          done={sshDone}
          active={isAt(s.phase, "ssh-check", "ssh-input")}
        />
        <StepRow
          label={adapterDone ? `Adapter: ${s.adapter}` : "Choose adapter"}
          done={adapterDone}
          active={isAt(s.phase, "adapter-select", "adapter-config")}
        />
        <StepRow
          label={authDone ? "Authenticated" : "Authenticate"}
          done={authDone}
          active={isAt(s.phase, "initializing", "auth-confirm", "authenticating")}
        />
        <StepRow
          label="First project"
          sub="optional — enter to skip"
          done={projectDone && !!s.projectId}
          active={isAt(s.phase, "project-input", "project-creating")}
        />
        <StepRow
          label="First secret"
          sub="optional — enter to skip"
          done={secretDone}
          active={isAt(s.phase, "secret-name-input", "secret-value-input", "secret-storing")}
        />
      </Box>

      {/* Error */}
      {s.error && (
        <Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="red">
          <Text color="red">✗ {s.error}</Text>
        </Box>
      )}

      {/* ── Active phase UI ── */}

      {s.phase === "ssh-check" && <Text dimColor color="gray">Loading…</Text>}

      {s.phase === "ssh-input" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>SSH private key path</Text>
          <InputRow
            label="Path"
            value={s.textInput}
            placeholder={s.sshKeyPath || "~/.ssh/id_ed25519"}
          />
          <Text dimColor color="gray" marginTop={1}>enter to confirm</Text>
        </Box>
      )}

      {s.phase === "adapter-select" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Storage backend</Text>
          <Box flexDirection="column" marginTop={1}>
            {ADAPTERS.map((a, i) => {
              const isActive = i === s.adapterCursor;
              const isCurrent = a === s.adapter && s.adapterCursor !== i;
              return (
                <Box key={a} gap={1}>
                  <Text color={isActive ? "cyan" : "gray"}>{isActive ? "▶" : " "}</Text>
                  <Text color={isActive ? "white" : "gray"}>{a}</Text>
                  {a === "local" && <Text dimColor color="gray">— no cloud needed</Text>}
                  {isCurrent && <Text color="green" dimColor> ← current</Text>}
                </Box>
              );
            })}
          </Box>
          <Text dimColor color="gray" marginTop={1}>↑↓ move  enter to select</Text>
        </Box>
      )}

      {s.phase === "adapter-config" && (() => {
        const fields  = ADAPTER_FIELDS[s.adapter];
        const field   = fields[s.adapterFieldIndex];
        const existing = (s.adapterFieldDefaults as Record<string, string>)[field.key as string];
        return (
          <Box flexDirection="column">
            <Text color="cyan" bold>
              {s.adapter} — {field.label}
              <Text color="gray"> ({s.adapterFieldIndex + 1}/{fields.length})</Text>
            </Text>
            {existing && (
              <Box gap={1} marginTop={1}>
                <Text dimColor color="gray">
                  {s.adapterFieldEnvSources[field.key as string]
                    ? `from $${s.adapterFieldEnvSources[field.key as string]}:`
                    : "keep existing:"}
                </Text>
                <Text dimColor color={s.adapterFieldEnvSources[field.key as string] ? "yellow" : "cyan"}>
                  {field.secret ? "•".repeat(existing.length) : existing}
                </Text>
              </Box>
            )}
            {field.secret ? (
              <Box gap={1} marginTop={1}>
                <Text color="gray">Value:</Text>
                <Text>{"•".repeat(s.textInput.length)}<Text inverse> </Text></Text>
              </Box>
            ) : (
              <InputRow label="Value" value={s.textInput} placeholder={field.hint} />
            )}
            <Text dimColor color="gray" marginTop={1}>
              {field.required ? "required" : "optional — enter to skip"}
            </Text>
          </Box>
        );
      })()}

      {isAuto && (
        <Box gap={1}>
          <Text color="cyan">⟳</Text>
          <Text color="gray">{s.status ?? "Working…"}</Text>
        </Box>
      )}

      {s.phase === "auth-confirm" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Authentication</Text>
          <Box gap={1} marginTop={1}>
            <Text color="green">✓</Text>
            <Text color="gray">Session active</Text>
            {s.existingSessionExpiry && (
              <Text dimColor color="gray">
                (expires {new Date(s.existingSessionExpiry).toLocaleDateString()})
              </Text>
            )}
          </Box>
          <Text dimColor color="gray" marginTop={1}>enter to keep   R to re-authenticate</Text>
        </Box>
      )}

      {s.phase === "project-input" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>First project</Text>
          <Text dimColor color="gray">e.g. myapp/prod, team/infra</Text>
          <InputRow label="Name" value={s.textInput} placeholder="enter to skip" />
        </Box>
      )}

      {s.phase === "secret-name-input" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>First secret</Text>
          {s.projectId
            ? <Text dimColor color="gray">stored in project: {s.projectId.slice(0, 12)}…</Text>
            : <Text dimColor color="gray">no project selected — enter to skip</Text>
          }
          <InputRow label="Name" value={s.textInput} placeholder="e.g. DATABASE_URL — enter to skip" />
        </Box>
      )}

      {s.phase === "secret-value-input" && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Value for <Text color="white">{s.secretName}</Text></Text>
          <Text dimColor color="gray">encrypted locally before upload</Text>
          <Box gap={1} marginTop={1}>
            <Text color="gray">Value:</Text>
            <Text>{"•".repeat(s.textInput.length)}<Text inverse> </Text></Text>
          </Box>
        </Box>
      )}

      {s.phase === "complete" && (
        <Box flexDirection="column">
          <Text color="green" bold>✓ Open Vault is ready.</Text>
          <Box flexDirection="column" marginTop={1}>
            <Text color="gray">  ov secret set &lt;NAME&gt; --project &lt;project&gt;</Text>
            <Text color="gray">  ov secret get &lt;NAME&gt; --project &lt;project&gt;</Text>
            <Text color="gray">  ov secret export --project &lt;project&gt; --output .env</Text>
            <Text color="gray">  ov ui</Text>
          </Box>
          <Text dimColor color="gray" marginTop={1}>enter or q to exit</Text>
        </Box>
      )}

    </Box>
  );
}
