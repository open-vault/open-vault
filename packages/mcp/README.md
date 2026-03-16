# @open-vault/mcp

MCP server for open-vault. Gives AI tools zero-trust, read-only access to your encrypted secrets. Secrets are decrypted client-side using your SSH key — plaintext never leaves your machine.

## Prerequisites

- `ov` CLI configured and authenticated (`ov auth login`)
- Bun ≥ 1.0 (or build to a standalone binary)

## Tools exposed

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects for the current user |
| `list_secrets` | List secret names/types in a project (no values) |
| `get_secret` | Decrypt and return a secret value |

## Usage with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-vault": {
      "command": "bun",
      "args": ["/path/to/open-vault/packages/mcp/src/index.ts"]
    }
  }
}
```

Or build a binary first:

```bash
cd packages/mcp
bun run build
```

Then use `dist/ov-mcp` as the command.

## Usage with Claude Code

Install the skill file:

```bash
cp packages/mcp/open-vault.skill.md ~/.claude/skills/open-vault.md
```

Or reference it in your project's `.claude/skills/` directory.

## Security model

- Secrets are **E2E encrypted** — only you can decrypt them (via your SSH private key)
- The MCP server never stores credentials
- Session tokens live in `~/.open-vault/session.json` (mode 0600)
- The server is **read-only** — it exposes no write tools intentionally
- All errors go to stderr; stdout carries only JSON-RPC responses

## Running manually

```bash
bun packages/mcp/src/index.ts
# open-vault MCP server ready  (on stderr)
```

Send JSON-RPC over stdin:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_secret","arguments":{"name":"MY_API_KEY"}}}
```
