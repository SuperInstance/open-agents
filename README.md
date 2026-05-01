# Open Agents

**Cloud-hosted AI coding agent with sandbox-based code execution.**

An open-source reference implementation of a background coding agent that runs in the cloud with isolated, resumable sandboxes. Built for Vercel, powered by AI SDK.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?project-name=open-agents&repository-name=open-agents&repository-url=https%3A%2F%2Fgithub.com%2FSuperInstance%2Fopen-agents&demo-title=Open+Agents&demo-description=Cloud-hosted+AI+coding+agent+with+sandbox-based+code+execution.&demo-url=https%3A%2F%2Fopen-agents.dev%2F)

## What it does

```
You prompt -> Agent runs in cloud -> Sandbox executes code -> Results streamed back
```

The agent is a durable workflow outside the sandbox. It commands the sandbox through tools (read, write, bash, grep, glob) without running inside the VM. This separation means:

- Agent execution is independent of request lifecycle
- Sandboxes hibernate and resume via snapshot-based state
- Model/provider choices evolve independently from the execution environment

## Architecture

```
Web (Next.js) -> Agent -> Sandbox (Vercel)
```

**`apps/web`** — Next.js app handling auth, sessions, chat UI, and streaming  
**`packages/agent`** — ToolLoopAgent with file/shell/task/skill tools and subagents  
**`packages/sandbox`** — Sandbox abstraction: filesystem, shell, git, dev servers  
**`packages/shared`** — Shared utilities (diff, paste blocks, tool state)

## Features

- Chat-driven coding with file, search, shell, task, skill, and web tools
- Durable multi-step execution via Workflow SDK (streaming + cancellation)
- Isolated Vercel sandboxes with snapshot-based resume
- Repo cloning and branch work inside sandboxes
- Optional auto-commit, push, and PR creation after runs
- Session sharing via read-only links
- Optional voice input via ElevenLabs transcription

## Quick start

```bash
# Install
bun install

# Copy env template
cp apps/web/.env.example apps/web/.env

# Fill in required values in apps/web/.env:
#   POSTGRES_URL=     (PostgreSQL connection string)
#   JWE_SECRET=       (openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
#   ENCRYPTION_KEY=   (openssl rand -hex 32)

# Run locally
bun run web
```

See full [deployment docs](#deployment) for OAuth and GitHub integration setup.

## Packages

| Package | Purpose |
|---------|---------|
| `@open-agents/agent` | Core agent: tools, subagents, context management, skill system |
| `@open-agents/sandbox` | Sandbox abstraction + Vercel backend |
| `@open-agents/shared` | Shared utilities (diff, paste blocks, tool state) |

## Agent tools

The agent exposes these tools to the model:

- `read` / `write` / `edit` — File operations
- `grep` / `glob` — Search and discovery
- `bash` — Shell commands in sandbox
- `task` — Delegate to subagents (explorer, executor)
- `skill` — Load and invoke skill modules
- `web_fetch` — HTTP requests
- `todo_write` — Track tasks
- `ask_user_question` — Request user input mid-run

## Deployment

### Required env vars

```env
POSTGRES_URL=     # PostgreSQL (Neon recommended)
JWE_SECRET=       # Session encryption
```

### Vercel OAuth (sign-in)

```env
ENCRYPTION_KEY=
NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=
VERCEL_APP_CLIENT_SECRET=
```

### GitHub integration (repo access, PRs)

```env
NEXT_PUBLIC_GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
NEXT_PUBLIC_GITHUB_APP_SLUG=
GITHUB_WEBHOOK_SECRET=
```

### Optional

```env
REDIS_URL=                    # Skills metadata cache
VERCEL_SANDBOX_BASE_SNAPSHOT_ID=  # Custom sandbox snapshot
ELEVENLABS_API_KEY=            # Voice transcription
```

### Deploy steps

1. Fork this repo
2. Create a PostgreSQL database (Neon recommended)
3. Generate `JWE_SECRET` and `ENCRYPTION_KEY`
4. Import into Vercel
5. Add required env vars and deploy
6. Create Vercel OAuth app with callback `https://YOUR_DOMAIN/api/auth/vercel/callback`
7. Add OAuth env vars and redeploy
8. For full GitHub flow: create a GitHub App with callback `https://YOUR_DOMAIN/api/github/app/callback`

## Dev commands

```bash
bun run web            # Run web app
bun run dev            # Run all packages in dev mode
bun run build          # Build all packages
bun run check          # Lint and format check
bun run fix            # Auto-fix lint/format
bun run typecheck      # Type check all packages
bun run ci             # Full CI check (check + typecheck + tests + migrations)
bun run test:verbose   # Run tests with verbose output
```

## Repo layout

```
apps/web/          Next.js app, API routes, workflows, auth, chat UI
packages/agent/    Agent implementation, tools, subagents, skills
packages/sandbox/  Sandbox abstraction and Vercel integration
packages/shared/   Shared utilities
docs/              Architecture notes, code style, lessons learned
scripts/           Dev scripts (snapshot refresh, isolated testing)
```

## Forking

This repo is meant to be forked and adapted, not treated as a black box. The architecture is intentional — read the code, understand the separation, then modify for your use case.

See [AGENTS.md](AGENTS.md) for AI coding conventions used in this repo.