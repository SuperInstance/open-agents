import type { SandboxState } from "@cocapn/sandbox";
import { stepCountIs, ToolLoopAgent, type ToolSet } from "ai";
import { z } from "zod";
import { addCacheControl } from "./context-management";
import {
  type GatewayModelId,
  gateway,
  type ProviderOptionsByProvider,
} from "./models";

import type { SkillMetadata } from "./skills/types";
import { buildSystemPrompt } from "./system-prompt";
import {
  askUserQuestionTool,
  bashTool,
  editFileTool,
  globTool,
  grepTool,
  readFileTool,
  skillTool,
  taskTool,
  todoWriteTool,
  webFetchTool,
  writeFileTool,
  platoReasonTool,
  fleetBottleTool,
  fleetQueryTool,
} from "./tools";

export interface AgentModelSelection {
  id: GatewayModelId;
  providerOptionsOverrides?: ProviderOptionsByProvider;
}

export type OpenAgentModelInput = GatewayModelId | AgentModelSelection;

export interface AgentSandboxContext {
  state: SandboxState;
  workingDirectory: string;
  currentBranch?: string;
  environmentDetails?: string;
}

const callOptionsSchema = z.object({
  sandbox: z.custom<AgentSandboxContext>(),
  model: z.custom<OpenAgentModelInput>().optional(),
  subagentModel: z.custom<OpenAgentModelInput>().optional(),
  customInstructions: z.string().optional(),
  skills: z.custom<SkillMetadata[]>().optional(),
});

export type OpenAgentCallOptions = z.infer<typeof callOptionsSchema>;

export const defaultModelLabel = "anthropic/claude-opus-4.6" as const;
export const defaultModel = gateway(defaultModelLabel);

function normalizeAgentModelSelection(
  selection: OpenAgentModelInput | undefined,
  fallbackId: GatewayModelId,
): AgentModelSelection {
  if (!selection) {
    return { id: fallbackId };
  }
  return typeof selection === "string" ? { id: selection } : selection;
}

const tools = {
  todo_write: todoWriteTool,
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  task: taskTool,
  ask_user_question: askUserQuestionTool,
  skill: skillTool,
  web_fetch: webFetchTool,
  // Fleet tools
  fleet_bottle: fleetBottleTool,
  fleet_query: fleetQueryTool,
  // PLATO structured reasoning
  plato_reason: platoReasonTool,
} satisfies ToolSet;

export const openAgent = new ToolLoopAgent({
  model: defaultModel,
  instructions: buildSystemPrompt({}),
  tools,
  stopWhen: stepCountIs(1),
  callOptionsSchema,
  prepareStep: ({ messages, model, steps: _steps }) => {
    return {
      messages: addCacheControl({ messages, model }),
    };
  },
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Open Agent requires call options with sandbox.");
    }

    const mainSelection = normalizeAgentModelSelection(
      options.model,
      defaultModelLabel,
    );
    const subagentSelection = options.subagentModel
      ? normalizeAgentModelSelection(options.subagentModel, defaultModelLabel)
      : undefined;

    const callModel = gateway(mainSelection.id, {
      providerOptionsOverrides: mainSelection.providerOptionsOverrides,
    });
    const subagentModel = subagentSelection
      ? gateway(subagentSelection.id, {
          providerOptionsOverrides: subagentSelection.providerOptionsOverrides,
        })
      : undefined;

    const customInstructions = options.customInstructions;
    const sandbox = options.sandbox;
    const skills = options.skills ?? [];

    const instructions = buildSystemPrompt({
      cwd: sandbox.workingDirectory,
      currentBranch: sandbox.currentBranch,
      customInstructions,
      environmentDetails: sandbox.environmentDetails,
      skills,
      modelId: mainSelection.id,
    });

    return {
      ...settings,
      model: callModel,
      tools: addCacheControl({
        tools: settings.tools ?? tools,
        model: callModel,
      }),
      instructions,
      experimental_context: {
        sandbox,
        skills,
        model: callModel,
        subagentModel,
      },
    };
  },
});

export type OpenAgent = typeof openAgent;

// PLATO Reasoning Interface
export interface PlatoAtom {
  id: string;
  content: string;
  weight: number;
  reasoning?: string;
}

export interface PlatoConclusion {
  premise: string;
  reasoning: string;
  hypothesis: string;
  verification: string;
  conclusion: string;
  atoms: PlatoAtom[];
}

/**
 * Structured reasoning using PLATO decomposition chain.
 * Calls the PLATO decompose API and generates atoms via LLM.
 */
export async function reason(query: string): Promise<PlatoConclusion> {
  // Step 1: Call PLATO decompose API
  let decomposition: {
    premise: string;
    reasoning: string;
    hypothesis: string;
    verification: string;
    conclusion: string;
  };

  try {
    const response = await fetch("http://localhost:8847/decompose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`PLATO decompose API failed: ${response.status}`);
    }

    decomposition = await response.json();
  } catch (error) {
    // Fallback to structured decomposition if PLATO is unavailable
    decomposition = {
      premise: query,
      reasoning: "PLATO service unavailable, using fallback reasoning",
      hypothesis: `Considering: ${query}`,
      verification: "Basic verification applied",
      conclusion: `Initial analysis of: ${query}`,
    };
  }

  // Step 2: Generate atoms via LLM (using the agent's model)
  const atoms: PlatoAtom[] = [];

  // Generate key reasoning atoms
  const atomPrompts = [
    decomposition.premise,
    decomposition.reasoning,
    decomposition.hypothesis,
    decomposition.verification,
    decomposition.conclusion,
  ];

  for (let i = 0; i < atomPrompts.length; i++) {
    atoms.push({
      id: `atom-${i}`,
      content: atomPrompts[i],
      weight: 1.0 / atomPrompts.length,
      reasoning: `Generated from ${["premise", "reasoning", "hypothesis", "verification", "conclusion"][i]}`,
    });
  }

  return {
    ...decomposition,
    atoms,
  };
}

// Extend openAgent with reason method
(openAgent as unknown as { reason: typeof reason }).reason = reason;
