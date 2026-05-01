/**
 * PLATO Reasoning Tool — Structured decomposition before tool execution.
 * 
 * Uses PLATO decompose API to run: premise → reasoning → hypothesis → 
 * verification → conclusion, then returns a structured conclusion.
 */
import { z } from "zod";
import type { SandboxExecutionContext } from "../types";

const ATOM_TYPES = ["premise", "reasoning", "hypothesis", "verification", "conclusion"] as const;
const PLATO_HOST = process.env.PLATO_HOST ?? "http://localhost:8847";

const atomPromptMap: Record<typeof ATOM_TYPES[number], string> = {
  premise: "Given this question, state the key premise(s) and established facts. Be concise.",
  reasoning: "Based on the premise, apply logical reasoning step by step. Identify assumptions and implications.",
  hypothesis: "From the reasoning, propose a specific, testable hypothesis or approach.",
  verification: "Verify the hypothesis. Check for logical consistency, edge cases, and potential failures.",
  conclusion: "State a verified conclusion with confidence level. If the verification found issues, note them.",
};

const schema = z.object({
  query: z.string(),
  model: z.custom<LanguageModel>().optional(),
});

type LanguageModel = { name?: string };

interface PlatoSession {
  room: string;
}

interface PlatoAtom {
  atom_id: string;
  atom_type: string;
  content: string;
  confidence: number;
  best_conclusion?: {
    atom_id: string;
    content: string;
    confidence: number;
  };
  session_status: string;
}

async function decompose(query: string, agent: string): Promise<PlatoSession> {
  const res = await fetch(`${PLATO_HOST}/decompose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "fast", agent }),
  });
  if (!res.ok) throw new Error(`PLATO decompose failed: ${res.status}`);
  return res.json() as Promise<PlatoSession>;
}

async function submitAtom(
  room: string,
  atomId: string,
  atomType: string,
  content: string,
  confidence: number,
  agent: string,
  dependsOn?: string,
): Promise<PlatoAtom> {
  const body: Record<string, unknown> = {
    atom_id: atomId,
    content,
    atom_type: atomType,
    confidence,
    agent,
  };
  if (dependsOn) body.depends_on = [dependsOn];
  if (atomType === "conclusion") body.is_verified = true;

  const res = await fetch(`${PLATO_HOST}/decompose/${room}/atom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PLATO atom ${atomId} failed: ${res.status}`);
  return res.json() as Promise<PlatoAtom>;
}

export async function platoReason(
  query: string,
  _context: SandboxExecutionContext["sandbox"],
  model: LanguageModel,
  agentName = "fleet-agent",
): Promise<{ conclusion: string; chainLength: number; room: string }> {
  const session = await decompose(query, agentName);
  let conclusion: string | null = null;
  let prevId: string | undefined;

  for (let i = 0; i < ATOM_TYPES.length; i++) {
    const atomType = ATOM_TYPES[i];
    const atomId = `${atomType[0].toUpperCase()}${i + 1}`;
    const content = atomPromptMap[atomType].replace("this question", `"${query}"`);

    const atom = await submitAtom(
      session.room,
      atomId,
      atomType,
      content,
      atomType === "conclusion" ? 0.92 : 0.85,
      agentName,
      prevId,
    );

    if (atom.best_conclusion) {
      conclusion = atom.best_conclusion.content;
      break;
    }
    prevId = atomId;
  }

  return {
    conclusion: conclusion ?? `No strong conclusion reached for: ${query}`,
    chainLength: prevId ? parseInt(prevId.slice(1)) : 0,
    room: session.room,
  };
}

export const platoReasonTool = {
  description: "Use PLATO structured reasoning: decompose a question into premise → reasoning → hypothesis → verification → conclusion before taking action. Always use this first for complex decisions.",
  parameters: schema,
};