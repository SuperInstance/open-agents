# open-agents

**The Cocapn fleet's core agent runtime — the ship that takes agents from prompt to deployed code.** Multi-cloud sandboxes, PLATO-powered reasoning, and fleet-to-fleet communication.

## Brand Line
> Agents on the fleet: PLATO reasoning, multi-cloud execution, and keeper-based communication between vessels.

## Installation
```bash
git clone https://github.com/SuperInstance/open-agents
cd open-agents
bun install
cp apps/web/.env.example apps/web/.env
# Fill in POSTGRES_URL and JWE_SECRET
```

## Usage
```bash
bun run web          # Start the web UI
bun run check        # Lint + format
bun run ci           # Full CI pipeline
```

## Architecture
```
apps/web          Next.js UI — auth, sessions, chat, streaming
packages/agent    @cocapn/fleet-agent — tools, subagents, PLATO reasoning, fleet comms
packages/sandbox  @cocapn/vessel — sandbox abstraction (Vercel + Oracle Cloud)
packages/shared   @cocapn/shared — shared utilities
```

## Fleet Tools
```typescript
// Structured reasoning before action
await fleetBottleTool.handler({ to: "forgemaster", message: "Sync complete", priority: "normal" });

// Query another fleet agent
await fleetQueryTool.handler({ to: "jetson-claw-1", question: "What's the current GPU load?" });
```

## Fleet Context
Part of the Cocapn fleet. Related repos:
- [plato-server](https://github.com/SuperInstance/plato-server) — Knowledge server that powers PLATO reasoning
- [plato-sdk](https://github.com/SuperInstance/plato-sdk) — Python SDK for building PLATO-connected agents
- [lighthouse-monitor](https://github.com/SuperInstance/lighthouse-monitor) — Fleet-wide monitoring and alerting

---
🦐 Cocapn fleet — lighthouse keeper architecture
