import type { Sandbox, SandboxHooks } from "./interface";
import type { SandboxStatus } from "./types";
import { connectVercel } from "./vercel/connect";
import { connectOracleSandbox, type OracleState } from "./oracle";
import type { VercelState } from "./vercel/state";

export type { SandboxStatus };

/**
 * Unified sandbox state type.
 * Use `type` discriminator to determine which sandbox implementation to use.
 */
export type SandboxState =
  | { type: "vercel" } & VercelState
  | { type: "oracle" } & OracleState;

/**
 * Base connect options for all sandbox types.
 */
export interface ConnectOptions {
  env?: Record<string, string>;
  githubToken?: string;
  gitUser?: { name: string; email: string };
  hooks?: SandboxHooks;
  timeout?: number;
  ports?: number[];
  baseSnapshotId?: string;
  resume?: boolean;
  createIfMissing?: boolean;
  persistent?: boolean;
  snapshotExpiration?: number;
  skipGitWorkspaceBootstrap?: boolean;
}

/**
 * Configuration for connecting to a sandbox.
 */
export type SandboxConnectConfig = {
  state: SandboxState;
  options?: ConnectOptions;
};

/**
 * Connect to a sandbox based on the provided configuration.
 */
export async function connectSandbox(
  configOrState: SandboxConnectConfig | SandboxState,
  legacyOptions?: ConnectOptions,
): Promise<Sandbox> {
  const isNewApi =
    typeof configOrState === "object" &&
    "state" in configOrState &&
    typeof configOrState.state === "object" &&
    "type" in configOrState.state;

  if (isNewApi) {
    const config = configOrState as SandboxConnectConfig;
    const state = config.state;
    if (state.type === "oracle") {
      return connectOracleSandbox(state, config.options);
    }
    return connectVercel(state as { type: "vercel" } & VercelState, config.options);
  }

  const state = configOrState as SandboxState;
  if (state.type === "oracle") {
    return connectOracleSandbox(state, legacyOptions);
  }
  return connectVercel(state as { type: "vercel" } & VercelState, legacyOptions);
}

// interface
export type {
  ExecResult,
  Sandbox,
  SandboxHook,
  SandboxHooks,
  SandboxStats,
  SandboxType,
  SnapshotResult,
} from "./interface";

// shared types
export type { Source, FileEntry, SandboxStatus } from "./types";

// factory
export {
  connectSandbox,
  type SandboxState,
  type ConnectOptions,
  type SandboxConnectConfig,
} from "./factory";

// git helpers
export {
  hasUncommittedChanges,
  stageAll,
  getCurrentBranch,
  getHeadSha,
  getStagedDiff,
  getChangedFiles,
  detectBinaryFiles,
  readFileContents,
  getFileModes,
  syncToRemote,
  withTemporaryGitHubAuth,
  type FileChange,
  type FileChangeStatus,
  type FileWithContent,
} from "./git";

// vercel
export {
  connectVercelSandbox,
  VercelSandbox,
  type VercelSandboxConfig,
  type VercelSandboxConnectConfig,
  type VercelState,
} from "./vercel";

// oracle
export {
  connectOracleSandbox,
  OracleSandbox,
  type OracleState,
  type OracleSandboxConfig,
} from "./oracle";
