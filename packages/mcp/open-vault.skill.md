---
name: open-vault
description: Manage encrypted secrets with open-vault CLI (ov)
triggers:
  - "secret"
  - "ov"
  - "open-vault"
  - "vault"
---

# open-vault CLI skill

open-vault (`ov`) is an E2E encrypted secrets manager. All values are encrypted client-side with the user's SSH key before touching any server — the server never sees plaintext.

## Setup

```bash
# Interactive guided setup (recommended for first-time users)
ov onboard

# Manual setup
ov auth init --adapter local          # local filesystem vault
ov auth init --adapter convex --url https://your-deployment.convex.cloud
ov auth init --adapter s3 --bucket my-bucket --region us-east-1
ov auth login                         # authenticate with SSH key
```

## Identity

```bash
ov auth whoami          # show current user ID, adapter, session expiry
ov auth logout          # clear local session
```

## Projects

```bash
ov project list                       # list all projects
ov project create <name>              # create a project
ov project delete <name>              # delete a project
ov project create <name> --team <id>  # create under a team
```

## Secrets

### Set / update a secret

```bash
ov secret set <name>                    # prompts for value interactively
ov secret set <name> --value "abc123"   # inline value
ov secret set <name> --file ./key.pem   # read from file
ov secret set <name> --project myapp   # target specific project
ov secret set <name> --type ENV_FILE    # types: KV (default), ENV_FILE, NOTE, JSON
```

### Get a secret

```bash
ov secret get <name>                    # prints NAME=value
ov secret get <name> --raw              # prints raw value only (good for piping)
ov secret get <name> --project myapp
```

### List secrets

```bash
ov secret list                          # list all secrets in default project
ov secret list --project myapp
ov secret list --type KV                # filter by type
```

### Delete a secret

```bash
ov secret delete <name>
ov secret delete <name> --project myapp
```

### Import / export

```bash
ov secret import .env                   # import from .env file
ov secret import .env --project myapp
ov secret export                        # export all secrets as .env to stdout
ov secret export --output .env.backup   # export to file
```

### Version history & rollback

```bash
ov secret versions <name>               # list all versions
ov secret rollback <name> --version <id>  # roll back to a specific version
```

## Tips for Claude

- When a user asks to "set", "save", or "store" a secret, use `ov secret set`.
- When a user asks to "get", "read", or "retrieve" a secret, use `ov secret get --raw` and handle the value programmatically.
- Secrets are always project-scoped. If no `--project` is given, `ov` defaults to the first project.
- Never echo secret values in plain text unless the user explicitly asks.
- If `ov auth whoami` returns "Not logged in", guide the user through `ov onboard` or `ov auth init` + `ov auth login`.
- The MCP server (`ov-mcp`) exposes `list_projects`, `list_secrets`, and `get_secret` as structured tools — prefer these over shell commands when the MCP server is available.
