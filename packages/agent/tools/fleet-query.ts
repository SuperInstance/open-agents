import { z } from "zod";
import { tool } from "./index";

export const fleetQueryTool = tool({
  description: "Query other fleet agents for information via the keeper service at port 8900. Use this to request data or status from other agents in the fleet.",
  parameters: z.object({
    target: z.string().describe("The name/ID of the target fleet agent"),
    query: z.string().describe("The query to send to the target agent"),
    timeout: z.number().optional().default(30000).describe("Query timeout in milliseconds"),
  }),
});

interface QueryResponse {
  success: boolean;
  response?: string;
  error?: string;
  timestamp: number;
}

export async function queryFleetAgent(
  target: string,
  query: string,
  timeout: number = 30000,
): Promise<QueryResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch("http://localhost:8900/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fleet-Agent": "fleet-agent",
      },
      body: JSON.stringify({
        target,
        query,
        sender: "fleet-agent",
        timestamp: Date.now(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Keeper responded with ${response.status}`,
        timestamp: Date.now(),
      };
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: `Query timed out after ${timeout}ms`,
        timestamp: Date.now(),
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}