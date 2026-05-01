/**
 * Fleet Bottle Tool — Send messages to other fleet agents via keeper:8900.
 * 
 * Fleet agents use bottles (messages) to communicate across the fleet.
 * Bottles are posted to the keeper service which routes them to target agents.
 */
import { z } from "zod";

const schema = z.object({
  to: z.string().describe("Target agent name (e.g., 'jetson-claw-1', 'forgemaster')"),
  message: z.string().describe("Message content to send"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

const KEEPER_HOST = process.env.KEEPER_HOST ?? "http://localhost:8900";

export async function fleetBottle(
  to: string,
  message: string,
  priority: "low" | "normal" | "high" = "normal",
): Promise<{ success: boolean; bottleId: string; status: string }> {
  const res = await fetch(`${KEEPER_HOST}/bottles/inbox`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      message,
      priority,
      from: "fleet-agent",
      ts: Date.now(),
    }),
  });

  if (!res.ok) {
    return { success: false, bottleId: "", status: `Failed: ${res.status}` };
  }

  const data = (await res.json()) as { id?: string; status?: string };
  return {
    success: true,
    bottleId: data.id ?? "unknown",
    status: data.status ?? "delivered",
  };
}

export const fleetBottleTool = {
  description: "Send a message to another fleet agent via the keeper bottle service. Use for cross-agent coordination, task delegation, and status updates.",
  parameters: schema,
};