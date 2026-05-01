/**
 * Oracle Cloud sandbox implementation using SSH-based remote execution.
 * Runs code on Oracle Cloud Compute instances via SSH.
 */

import type { Dirent } from "fs";
import type {
  ExecResult,
  Sandbox,
  SandboxHooks,
  SandboxStats,
  SnapshotResult,
} from "../interface";
import type { SandboxStatus } from "../types";

const MAX_OUTPUT_LENGTH = 50_000;
const DEFAULT_WORKING_DIRECTORY = "/home/ubuntu/workspace";
const DEFAULT_USER = "ubuntu";
const DEFAULT_TIMEOUT_MS = 300_000;

export interface OracleSandboxConfig {
  /** Hostname or IP of the Oracle Cloud instance */
  host: string;
  /** SSH user (default: ubuntu) */
  user?: string;
  /** Path to private key (default: ~/.ssh/id_rsa) */
  privateKeyPath?: string;
  /** SSH port (default: 22) */
  port?: number;
  /** Working directory on remote (default: /home/ubuntu/workspace) */
  workingDirectory?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Git user for commits */
  gitUser?: { name: string; email: string };
  /** Lifecycle hooks */
  hooks?: SandboxHooks;
  /** Timeout in ms (default: 300000) */
  timeout?: number;
}

interface OracleSession {
  host: string;
  user: string;
  privateKeyPath: string;
  port: number;
  workingDirectory: string;
  isStopped: boolean;
}

/**
 * Oracle Cloud Sandbox using SSH-based remote execution.
 */
export class OracleSandbox implements Sandbox {
  readonly type = "cloud" as const;
  readonly name: string;
  readonly id: string;
  readonly workingDirectory: string;
  readonly env?: Record<string, string>;
  readonly hooks?: SandboxHooks;

  private session: OracleSession;
  private _expiresAt?: number;
  private _timeout?: number;

  get expiresAt(): number | undefined {
    return this._expiresAt;
  }

  get timeout(): number | undefined {
    return this._timeout;
  }

  get environmentDetails(): string {
    return `- Oracle Cloud Compute instance at ${this.session.host}
- SSH-based remote execution
- Working directory: ${this.workingDirectory}
- Git available
- Node.js/Bun runtime preinstalled`;
  }

  private constructor(
    session: OracleSession,
    name: string,
    id: string,
    workingDirectory: string,
    env?: Record<string, string>,
    hooks?: SandboxHooks,
    timeout?: number,
  ) {
    this.session = session;
    this.name = name;
    this.id = id;
    this.workingDirectory = workingDirectory;
    this.env = env;
    this.hooks = hooks;
    this._timeout = timeout;
    this._expiresAt = timeout ? Date.now() + timeout : undefined;
  }

  /**
   * Create a new Oracle Cloud Sandbox instance.
   */
  static async create(config: OracleSandboxConfig): Promise<OracleSandbox> {
    const {
      host,
      user = DEFAULT_USER,
      privateKeyPath = "~/.ssh/id_rsa",
      port = 22,
      workingDirectory = DEFAULT_WORKING_DIRECTORY,
      env,
      gitUser,
      hooks,
      timeout = DEFAULT_TIMEOUT_MS,
    } = config;

    const session: OracleSession = {
      host,
      user,
      privateKeyPath: privateKeyPath.replace("~", process.env.HOME || "/root"),
      port,
      workingDirectory,
      isStopped: false,
    };

    // Ensure working directory exists
    await execSSH(session, `mkdir -p ${workingDirectory}`);

    // Initialize git repo if needed
    const gitInitResult = await execSSH(
      session,
      `cd ${workingDirectory} && git rev-parse --is-inside-work-tree 2>/dev/null || git init`,
    );

    // Configure git user if provided
    if (gitUser && gitInitResult.stdout.includes("Initialized empty")) {
      await execSSH(session, `cd ${workingDirectory} && git config user.name "${gitUser.name}"`);
      await execSSH(session, `cd ${workingDirectory} && git config user.email "${gitUser.email}"`);
      await execSSH(
        session,
        `cd ${workingDirectory} && git commit --allow-empty -m "Initial commit"`,
      );
    }

    const startTime = Date.now();
    const id = `oracle-${host}-${startTime}`;

    const sandbox = new OracleSandbox(
      session,
      `oracle-${host}`,
      id,
      workingDirectory,
      env,
      hooks,
      timeout,
    );

    // Call afterStart hook if provided
    if (hooks?.afterStart) {
      await hooks.afterStart(sandbox);
    }

    return sandbox;
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    const result = await execSSH(
      this.session,
      `cat "${path}"`,
      { timeout: 30000 },
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${path}`);
    }
    return result.stdout;
  }

  async readFileBuffer(path: string): Promise<Buffer> {
    // For binary files, use base64 encoding
    const result = await execSSH(
      this.session,
      `base64 "${path}"`,
      { timeout: 30000 },
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${path}`);
    }
    return Buffer.from(result.stdout.trim(), "base64");
  }

  async writeFile(
    path: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    // Create parent directory if needed
    const parentDir = path.substring(0, path.lastIndexOf("/"));
    if (parentDir) {
      await execSSH(this.session, `mkdir -p "${parentDir}"`);
    }

    // Write file via base64 to handle special characters
    const encoded = Buffer.from(content, "utf-8").toString("base64");
    const result = await execSSH(
      this.session,
      `echo "${encoded}" | base64 -d > "${path}"`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${path}`);
    }
  }

  async stat(path: string): Promise<SandboxStats> {
    const result = await execSSH(
      this.session,
      `stat -c "%F,%s,%Y" "${path}"`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    const [fileType, sizeStr, mtimeStr] = result.stdout.trim().split(",");
    const isDir = fileType === "directory";
    const size = parseInt(sizeStr, 10);
    const mtimeMs = parseInt(mtimeStr, 10) * 1000;

    return {
      isDirectory: () => isDir,
      isFile: () => !isDir,
      size,
      mtimeMs,
    };
  }

  async access(path: string): Promise<void> {
    const result = await execSSH(
      this.session,
      `test -e "${path}"`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const args = options?.recursive ? ["-p", path] : [path];
    const result = await execSSH(
      this.session,
      `mkdir ${args.map((p) => `"${p}"`).join(" ")}`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create directory: ${path}`);
    }
  }

  async readdir(
    path: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const result = await execSSH(
      this.session,
      `find "${path}" -maxdepth 1 -mindepth 1 -printf "%y %f\\n"`,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }

    const output = result.stdout.trim();
    if (!output) {
      return [];
    }

    return output.split("\n").map((line) => {
      const [type, ...nameParts] = line.split(" ");
      const name = nameParts.join(" ");
      const isDir = type === "d";
      const isFile = type === "f";
      const isSymlink = type === "l";

      return {
        name,
        parentPath: path,
        path: path,
        isDirectory: () => isDir,
        isFile: () => isFile,
        isSymbolicLink: () => isSymlink,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
      } as Dirent;
    });
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    const envVars = this.env
      ? Object.entries(this.env)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")
      : "";

    const fullCommand = `cd "${cwd}" && ${envVars} ${command}`.trim();

    try {
      const result = await execSSH(this.session, fullCommand, {
        timeout: timeoutMs,
        signal: options?.signal,
      });

      let stdout = result.stdout;
      let truncated = false;

      if (stdout.length > MAX_OUTPUT_LENGTH) {
        stdout = stdout.slice(0, MAX_OUTPUT_LENGTH);
        truncated = true;
      }

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout,
        stderr: result.stderr,
        truncated,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "TimeoutError" || error.message.includes("timed out")) {
          return {
            success: false,
            exitCode: null,
            stdout: "",
            stderr: `Command timed out after ${timeoutMs}ms`,
            truncated: false,
          };
        }
      }
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        truncated: false,
      };
    }
  }

  async stop(): Promise<void> {
    if (this.session.isStopped) return;
    this.session.isStopped = true;

    if (this.hooks?.beforeStop) {
      try {
        await this.hooks.beforeStop(this);
      } catch (error) {
        console.error("[OracleSandbox] beforeStop hook failed:", error);
      }
    }

    this._expiresAt = undefined;
  }

  get status(): SandboxStatus {
    if (this.session.isStopped) return "stopped";
    return "ready";
  }

  getState(): { type: "oracle" } & OracleSandboxConfig {
    return {
      type: "oracle",
      host: this.session.host,
      user: this.session.user,
      privateKeyPath: this.session.privateKeyPath,
      port: this.session.port,
      workingDirectory: this.session.workingDirectory,
      env: this.env,
      hooks: this.hooks,
      timeout: this._timeout,
    };
  }
}

interface SSHExecOptions {
  timeout?: number;
  signal?: AbortSignal;
}

async function execSSH(
  session: OracleSession,
  command: string,
  options: SSHExecOptions = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { timeout = 30000, signal } = options;

  const sshArgs = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-p", session.port.toString(),
    "-i", session.privateKeyPath,
    `${session.user}@${session.host}`,
    command,
  ];

  return new Promise((resolve, reject) => {
    const proc = Bun.spawn(["ssh", ...sshArgs], {
      stdout: "pipe",
      stderr: "pipe",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);

    proc.stdout.pipeTo(
      new WritableStream({
        write(data) {
          stdout += data;
        },
      }),
    );

    proc.stderr.pipeTo(
      new WritableStream({
        write(data) {
          stderr += data;
        },
      }),
    );

    proc.exited.then((code) => {
      clearTimeout(timeoutId);
      if (signal?.aborted) {
        reject(new Error("Operation aborted"));
        return;
      }
      if (timedOut) {
        reject(new Error(`SSH command timed out after ${timeout}ms`));
        return;
      }
      resolve({
        exitCode: code,
        stdout,
        stderr,
      });
    });

    signal?.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      proc.kill();
      reject(new Error("Operation aborted"));
    });
  });
}

/**
 * Connect to an Oracle Cloud Sandbox.
 */
export async function connectOracleSandbox(
  config: OracleSandboxConfig,
): Promise<OracleSandbox> {
  return OracleSandbox.create(config);
}