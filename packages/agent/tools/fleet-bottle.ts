import { z } from "zod";
import { tool } from "./index";

export const fleetBottleTool = tool({
  description: "Send a message to another fleet agent via the keeper service at port 8900. Use this to communicate with other agents in the fleet.",
  parameters: z.object({
    recipient: z.string().describe("The name/ID of the target fleet agent"),
    message: z.string().describe("The message content to send"),
    priority: z.enum(["low", "normal", "high"]).optional().default("normal"),
  }),
});

interface BottleResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: number;
}

export async function sendFleetBottle(
  recipient: string,
  message: string,
  priority: "low" | "normal" | "high" = "normal",
): Promise<BottleResponse> {
  try {
    const response = await fetch("http://localhost:8900/bottle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Fleet-Agent": "fleet-agent",
      },
      body: JSON.stringify({
        recipient,
        message,
        priority,
        sender: "fleet-agent",
        timestamp: Date.now(),
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Keeper responded with ${response.status}`,
        timestamp: Date.now(),
      };
    }

    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    };
  }
}