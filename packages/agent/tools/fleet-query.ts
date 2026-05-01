/**
 * Fleet Query Tool — Query other fleet agents for information.
 * 
 * Use this to ask other agents questions or get their status.
 * The keeper routes the query and returns the agent's response.
 */
import { z } from "zod";

const schema = z.object({
  to: z.string().describe("Target agent name"),
  question: z.string().describe("Question or query for the target agent"),
  timeout: z.number().default(30000).describe("Timeout in ms"),
});

const KEEPER_HOST = process.env.KEEPER_HOST ?? "http://localhost:8900";

export async function fleetQuery(
  to: string,
  question: string,
  timeout = 30000,
): Promise<{ answer: string; agent: string; latency: number }> {
  const start = Date.now();

  const res = await fetch(`${KEEPER_HOST}/agents/${to}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, timeout }),
  });

  const latency = Date.now() - start;

  if (!res.ok) {
    return {
      answer: `Query to ${to} failed (${res.status}): agent may be offline`,
      agent: to,
      latency,
    };
  }

  const data = (await res.json()) as { answer?: string };
  return {
    answer: data.answer ?? "No response from agent",
    agent: to,
    latency,
  };
}

export const fleetQueryTool = {
  description: "Ask another fleet agent a question and get a response. Use this to leverage collective fleet knowledge rather than solving everything independently.",
  parameters: schema,
};