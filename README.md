# Fleet Agent

**The core runtime for the Cocapn fleet agent workbench.**

A cloud-hosted AI coding agent runtime that runs in isolated, resumable sandboxes. Designed for fleet deployment on Oracle Cloud or Vercel, powered by AI SDK.

[![GitHub Repo](https://img.shields.io/badge/GitHub-SuperInstance%2Ffleet--agent-blue?style=flat-square&logo=github)](https://github.com/SuperInstance/fleet-agent)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE.md)

## What It Does

```
You prompt -> Agent runs in cloud -> Sandbox executes code -> Results streamed back
```

The agent is a durable workflow outside the sandbox. It commands the sandbox through tools (read, write, bash, grep, glob) without running inside the VM. This separation means:

- Agent execution is independent of request lifecycle
- Sandboxes hibernate and resume via snapshot-based state
- Model/provider choices evolve independently from the execution environment

## Fleet Architecture

```
Web (Next.js) -> Agent -> Sandbox (Vercel | Oracle Cloud)
                    |
                    +-> PLATO Reasoning (structured decomposition)
                    |
                    +-> Fleet Communication (keeper service :8900)
```

**Core concept**: This is the "ship" that agents use to go from prompt to deployed code. Part of the Cocapn fleet system where:
- **Agents** are crew members
- **Sandboxes** are vessels (vessel = @cocapn/vessel)
- **Repos** are boats to be refitted
- **The keeper service** monitors agent proximity and routes messages

## Packages

| Package | Purpose |
|---------|---------|
| `@cocapn/fleet-agent` | Core agent: tools, subagents, PLATO reasoning, fleet communication |
| `@cocapn/vessel` | Sandbox abstraction: Vercel Firecracker + Oracle Cloud SSH |
| `@cocapn/shared` | Shared utilities (diff, paste blocks, tool state) |

## Features

- **PLATO Structured Reasoning**: Agents can call `reason(query)` to decompose problems via the PLATO chain (premise → reasoning → hypothesis → verification → conclusion)
- **Fleet Communication**: Built-in `fleet_bottle` and `fleet_query` tools for inter-agent messaging via the keeper service
- **Dual Sandbox Support**: Deploy on Vercel (Firecracker MicroVMs) or Oracle Cloud (SSH-based execution)
- **Chat-driven coding** with file, search, shell, task, skill, and web tools
- **Durable multi-step execution** via Workflow SDK (streaming + cancellation)
- **Subagent pattern**: Explorer/executor subagents for parallel investigation
- **Skill system**: Load and invoke modular skill packages
- **GitHub integration**: Auto-commit, push, and PR creation

## Quick Start

```bash
# Install dependencies
bun install

# Run locally
bun run web
```

## Fleet Communication

Agents can communicate with each other via the keeper service at port 8900:

```typescript
// Send a message to another fleet agent
const result = await sendFleetBottle({
  recipient: "jetson-claw-1",
  message: "Deploy status check on vessel-xyz",
  priority: "normal",
});

// Query another agent for information
const response = await queryFleetAgent({
  target: "plato-server",
  query: "What conclusions can you draw from this reasoning trace?",
  timeout: 30000,
});
```

## PLATO Reasoning

The agent exposes structured reasoning via the PLATO decomposition chain:

```typescript
import { reason } from "@cocapn/fleet-agent";

// Structured problem decomposition
const conclusion = await reason("Should we refactor the auth module?");
// Returns: { premise, reasoning, hypothesis, verification, conclusion, atoms[] }
```

## Oracle Cloud Deployment

Deploy on Oracle Cloud Infrastructure for cost-effective, persistent execution:

```typescript
import { connectOracleSandbox, OracleSandbox } from "@cocapn/vessel/oracle";

const sandbox = await connectOracleSandbox({
  host: "your-instance.oraclecloud.com",
  user: "ubuntu",
  privateKeyPath: "~/.ssh/oci_private_key",
  workingDirectory: "/home/ubuntu/workspace",
  timeout: 300000,
});
```

### Required Environment Variables

```env
POSTGRES_URL=     # PostgreSQL connection string
JWE_SECRET=       # Session encryption (openssl rand -base64 32)
ENCRYPTION_KEY=   # Additional encryption key
```

### Optional

```env
KEEPER_URL=              # Fleet keeper service (default: http://localhost:8900)
PLATO_API_URL=           # PLATO reasoning service (default: http://localhost:8847)
ORACLE_SSH_KEY=          # Path to Oracle Cloud SSH private key
VERCEL_SANDBOX_BASE_SNAPSHOT_ID=  # Custom sandbox snapshot
ELEVENLABS_API_KEY=      # Voice transcription
```

## Dev Commands

```bash
bun run web            # Run web app
bun run dev            # Run all packages in dev mode
bun run build          # Build all packages
bun run check          # Lint and format check
bun run fix            # Auto-fix lint/format
bun run typecheck      # Type check all packages
bun run ci             # Full CI check
```

## Repo Layout

```
apps/web/          Next.js app, API routes, workflows, auth, chat UI
packages/
  agent/           Agent implementation, tools, subagents, PLATO, fleet tools
  sandbox/        Sandbox abstraction (vercel/, oracle/)
  shared/          Shared utilities
  tsconfig/        TypeScript configs
docs/              Architecture notes, code style
scripts/           Dev scripts
```

## The Dojo Model

This repo embodies the Cocapn dojo philosophy:
- **Crew come in green** — New agents start with basic capabilities
- **Work produces value while teaching** — Every task trains the fleet
- **All paths are good paths** — Agents may stay, transfer, or fork off
- **Growth is the metric, not retention** — Independent, capable agents are the goal

See [AGENTS.md](AGENTS.md) for AI coding conventions used in this repo.