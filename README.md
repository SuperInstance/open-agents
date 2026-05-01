# Fleet Agent

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?project-name=open-agents&repository-name=open-agents&repository-url=https%3A%2F%2Fgithub.com%2FSuperInstance%2Fopen-agents)

**Fleet Agent** is the Cocapn fleet's core agent runtime — the ship that takes agents from prompt to deployed code. It's a three-layer system:

```
Web UI → Agent Runtime → Sandbox Execution
```

Built for fleet deployment: PLATO-powered structured reasoning, fleet-to-fleet communication via keeper, and multi-cloud sandbox adapters (Vercel + Oracle Cloud).

## What it does

- **Coding agents** with file, search, shell, task, skill, and web tools
- **Fleet tools**: message other agents (`fleet_bottle`), query fleet knowledge (`fleet_query`)
- **PLATO reasoning**: structured decomposition before tool execution (premise → reasoning → hypothesis → verification → conclusion)
- **Multi-cloud sandboxes**: Vercel (default) or Oracle Cloud SSH-based execution
- **Durable multi-step execution** with streaming, cancellation, and session resume
- **GitHub integration**: auto-commit, push, and PR creation after successful runs
- **Skills system**: load agent skills from disk with frontmatter metadata

## Architecture

```
apps/web          Next.js UI — auth, sessions, chat, streaming
packages/agent    @cocapn/fleet-agent — tools, subagents, PLATO reasoning, fleet comms
packages/sandbox  @cocapn/vessel — sandbox abstraction (Vercel + Oracle Cloud)
packages/shared   @cocapn/shared — shared utilities
```

## Quick Start

```bash
bun install
cp apps/web/.env.example apps/web/.env
# Fill in POSTGRES_URL and JWE_SECRET
bun run web
```

## Fleet Tools

Agents have two extra tools beyond the standard toolkit:

### `plato_reason`
Structured reasoning before action. Decomposes queries through PLATO's 5-atom chain:

```
premise → reasoning → hypothesis → verification → conclusion
```

Always runs against the fleet's PLATO server at `http://localhost:8847`.

### `fleet_bottle`
Send messages to other fleet agents via keeper:8900.

```typescript
await fleetBottleTool.handler({ to: "forgemaster", message: "Sync complete", priority: "normal" });
```

### `fleet_query`
Query another fleet agent for information.

```typescript
await fleetQueryTool.handler({ to: "jetson-claw-1", question: "What's the current GPU load?" });
```

## Oracle Cloud Deployment

SSH-based sandbox for Oracle Cloud Infrastructure:

```typescript
import { connectSandbox, type OracleState } from "@cocapn/vessel";

const state: OracleState = {
  type: "oracle",
  instanceId: "ocid1.instance.oc1...",
  host: "144.24.x.x",
  port: 22,
  user: "ubuntu",
  keyPath: "~/.ssh/oci_id_rsa",
  workingDirectory: "/home/ubuntu/workspace",
};

const sandbox = await connectSandbox({ state });
```

## Useful Commands

```bash
bun run web          # Start web app
bun run check        # Lint + format
bun run ci           # Full CI (check + typecheck + test)
```

## Repo Structure

```
open-agents/
├── apps/web/            Next.js UI + workflows
├── packages/
│   ├── agent/           @cocapn/fleet-agent — core agent
│   │   ├── tools/       plato-reason, fleet-bottle, fleet-query + standard tools
│   │   ├── subagents/   explorer + executor patterns
│   │   └── skills/      skill discovery + loading
│   ├── sandbox/         @cocapn/vessel — execution environments
│   │   ├── vercel/      Vercel cloud sandbox
│   │   └── oracle/      Oracle Cloud SSH sandbox
│   └── shared/          utilities
└── docs/agents/         Agent dev documentation
```
