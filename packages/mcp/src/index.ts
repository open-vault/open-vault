#!/usr/bin/env bun
import { createInterface } from "readline";
import { loadConfig } from "../../cli/src/lib/config.js";
import { loadSession } from "../../cli/src/lib/session.js";
import { createAdapter } from "../../cli/src/lib/adapter.js";
import { deriveMasterKey, decryptValue } from "../../cli/src/lib/crypto.js";

// --- JSON-RPC 2.0 types ---

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// --- Tool definitions ---

const TOOLS = [
  {
    name: "list_projects",
    description: "List all vault projects accessible to the current user.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_secrets",
    description: "List secrets in a project. Returns name, type, and id — does NOT return values.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project name. Defaults to the first project if omitted.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_secret",
    description: "Decrypt and return the value of a named secret. The value is decrypted client-side using the user's SSH key.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the secret to retrieve.",
        },
        project: {
          type: "string",
          description: "Project name. Defaults to the first project if omitted.",
        },
      },
      required: ["name"],
    },
  },
];

// --- Helpers ---

function respond(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function respondError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function log(msg: string) {
  process.stderr.write(`[ov-mcp] ${msg}\n`);
}

// --- Tool handlers ---

async function handleListProjects(): Promise<unknown> {
  const config = loadConfig();
  const session = loadSession();
  if (!session) throw new Error("Not authenticated. Run 'ov auth login' first.");

  const adapter = createAdapter(config);
  const projects = await adapter.listProjects(session.userId);
  return projects.map((p) => ({ name: p.name, id: p.id, ownerType: p.ownerType }));
}

async function handleListSecrets(args: { project?: string }): Promise<unknown> {
  const config = loadConfig();
  const session = loadSession();
  if (!session) throw new Error("Not authenticated. Run 'ov auth login' first.");

  const adapter = createAdapter(config);
  const projects = await adapter.listProjects(session.userId);
  const project = args.project
    ? projects.find((p) => p.name === args.project)
    : projects[0];

  if (!project) {
    throw new Error(
      args.project ? `Project "${args.project}" not found.` : "No projects found."
    );
  }

  const secrets = await adapter.listSecrets(project.id);
  return secrets.map((s) => ({ name: s.name, type: s.type, id: s.id }));
}

async function handleGetSecret(args: { name: string; project?: string }): Promise<unknown> {
  const config = loadConfig();
  const session = loadSession();
  if (!session) throw new Error("Not authenticated. Run 'ov auth login' first.");

  const adapter = createAdapter(config);
  const projects = await adapter.listProjects(session.userId);
  const project = args.project
    ? projects.find((p) => p.name === args.project)
    : projects[0];

  if (!project) {
    throw new Error(
      args.project ? `Project "${args.project}" not found.` : "No projects found."
    );
  }

  const secrets = await adapter.listSecrets(project.id);
  const secret = secrets.find((s) => s.name === args.name);
  if (!secret) throw new Error(`Secret "${args.name}" not found.`);

  const { version } = await adapter.getSecret(secret.id);
  const masterKey = await deriveMasterKey(config.sshKeyPath);
  const value = await decryptValue(
    masterKey,
    version.encryptedValue,
    version.encryptedKey,
    version.iv
  );

  return { name: secret.name, value };
}

// --- Request dispatcher ---

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = req;

  if (method === "initialize") {
    return respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "open-vault", version: "0.1.0" },
    });
  }

  if (method === "tools/list") {
    return respond(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    const toolName = p?.name;
    const args = p?.arguments ?? {};

    try {
      let result: unknown;

      if (toolName === "list_projects") {
        result = await handleListProjects();
      } else if (toolName === "list_secrets") {
        result = await handleListSecrets(args as { project?: string });
      } else if (toolName === "get_secret") {
        result = await handleGetSecret(args as { name: string; project?: string });
      } else {
        return respondError(id, -32601, `Unknown tool: ${toolName}`);
      }

      return respond(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Tool error [${toolName}]: ${msg}`);
      return respond(id, {
        content: [{ type: "text", text: `Error: ${msg}` }],
        isError: true,
      });
    }
  }

  // Silently ack notifications (no id = notification)
  if (id === null || id === undefined) {
    return null as unknown as JsonRpcResponse;
  }

  return respondError(id, -32601, `Method not found: ${method}`);
}

// --- Main stdio loop ---

process.stderr.write("open-vault MCP server ready\n");

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    const err = respondError(null, -32700, "Parse error");
    process.stdout.write(JSON.stringify(err) + "\n");
    return;
  }

  try {
    const res = await dispatch(req);
    if (res !== null && res !== undefined) {
      process.stdout.write(JSON.stringify(res) + "\n");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`Unhandled dispatch error: ${msg}`);
    const err = respondError(req.id ?? null, -32603, "Internal error", msg);
    process.stdout.write(JSON.stringify(err) + "\n");
  }
});

rl.on("close", () => {
  log("stdin closed, exiting");
  process.exit(0);
});
