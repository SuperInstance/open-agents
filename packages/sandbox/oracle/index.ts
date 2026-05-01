/**
 * Oracle Cloud Sandbox Adapter
 * 
 * SSH-based sandbox implementation for Oracle Cloud Infrastructure (OCI) VMs.
 * Uses SSH to execute commands remotely, mirroring the interface of the Vercel adapter.
 * 
 * Requirements:
 *   - SSH access to the OCI VM (password or key-based auth)
 *   - Oracle Cloud instance with public IP
 *   - Node.js/Bun runtime on the remote VM
 */
import type { Dirent } from "fs";
import type { ExecResult, Sandbox, SandboxHook, SandboxStats, SnapshotResult } from "../interface";
import type { SandboxStatus } from "../types";

// Re-use the same result shape as Vercel
export interface OracleState {
  type: "oracle";
  instanceId: string;
  host: string;
  port: number;
  user: string;
  keyPath?: string;
  password?: string;
  workingDirectory: string;
  currentBranch?: string;
}

export interface OracleSandboxConfig {
  instanceId: string;
  host: string;
  port?: number;
  user: string;
  keyPath?: string;
  password?: string;
  workingDirectory?: string;
  currentBranch?: string;
  hooks?: SandboxHooks;
  env?: Record<string, string>;
  timeout?: number;
}

function toUnixPath(windowsPath: string): string {
  return windowsPath.replace(/\\/g, "/");
}

async function sshExec(
  host: string,
  port: number,
  user: string,
  command: string,
  cwd: string,
  timeoutMs: number,
  options?: { signal?: AbortSignal; keyPath?: string; password?: string },
): Promise<ExecResult> {
  const keyArg = options?.keyPath ? ['-i', options.keyPath] : [];
  const passwordArg = options?.password ? ['sshpass', '-p', options.password] : [];
  const sshArgs = [
    ...passwordArg,
    'ssh',
    '-o', 'StrictHostKeyChecking=no',
    '-o', `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
    '-o', 'ServerAliveInterval=30',
    '-p', String(port),
    ...keyArg,
    `${user}@${host}`,
    `cd ${cwd} && ${command}`,
  ];

  try {
    const proc = Bun.spawn(sshArgs, {
      timeout: timeoutMs,
      signal: options?.signal,
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    const truncated = stdout.length > 50_000 || stderr.length > 50_000;

    return {
      success: exitCode === 0,
      exitCode,
      stdout: stdout.slice(0, 50_000),
      stderr: stderr.slice(0, 50_000),
      truncated,
    };
  } catch (err) {
    return {
      success: false,
      exitCode: null,
      stdout: "",
      stderr: String(err),
      truncated: false,
    };
  }
}

export class OracleSandbox implements Sandbox {
  readonly type = "cloud" as const;
  readonly workingDirectory: string;
  readonly currentBranch?: string;
  readonly hooks?: SandboxHooks;
  readonly env?: Record<string, string>;
  readonly timeout?: number;

  private _instanceId: string;
  private _host: string;
  private _port: number;
  private _user: string;
  private _keyPath?: string;
  private _password?: string;
  private _stopped = false;

  constructor(config: OracleSandboxConfig) {
    this._instanceId = config.instanceId;
    this._host = config.host;
    this._port = config.port ?? 22;
    this._user = config.user;
    this._keyPath = config.keyPath;
    this._password = config.password;
    this.workingDirectory = config.workingDirectory ?? "/home/ubuntu/workspace";
    this.currentBranch = config.currentBranch;
    this.hooks = config.hooks;
    this.env = config.env;
    this.timeout = config.timeout ?? 300_000;
  }

  get host(): string {
    return this._host;
  }

  private async _exec(cmd: string, cwd?: string): Promise<ExecResult> {
    return sshExec(
      this._host,
      this._port,
      this._user,
      cmd,
      cwd ?? this.workingDirectory,
      this.timeout!,
      { keyPath: this._keyPath, password: this._password },
    );
  }

  async readFile(path: string): Promise<string> {
    const result = await this._exec(`cat ${path}`);
    if (!result.success) throw new Error(`readFile ${path}: ${result.stderr}`);
    return result.stdout;
  }

  async readFileBuffer(path: string): Promise<Buffer> {
    const result = await this._exec(`cat ${path} | base64`);
    if (!result.success) throw new Error(`readFileBuffer ${path}: ${result.stderr}`);
    return Buffer.from(result.stdout.trim(), "base64");
  }

  async writeFile(path: string, content: string): Promise<void> {
    const encoded = Buffer.from(content).toString("base64");
    const result = await this._exec(`echo "${encoded}" | base64 -d > ${path}`);
    if (!result.success) throw new Error(`writeFile ${path}: ${result.stderr}`);
  }

  async stat(path: string): Promise<SandboxStats> {
    const result = await this._exec(
      `node -e "const fs=require('fs');const s=fs.statSync('${path}');console.log(JSON.stringify({size:s.size,mtimeMs:s.mtimeMs,isFile:s.isFile(),isDir:s.isDirectory()}))"`,
    );
    if (!result.success) throw new Error(`stat ${path}: ${result.stderr}`);
    return JSON.parse(result.stdout) as SandboxStats;
  }

  async access(path: string): Promise<void> {
    const result = await this._exec(`test -e ${path} && echo ok`);
    if (!result.success) throw new Error(`access ${path}: no such file`);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const flag = options?.recursive ? "-p" : "";
    const result = await this._exec(`mkdir ${flag} ${path}`);
    if (!result.success) throw new Error(`mkdir ${path}: ${result.stderr}`);
  }

  async readdir(path: string): Promise<Dirent[]> {
    const result = await this._exec(
      `node -e "const fs=require('fs');const e=fs.readdirSync('${path}',{withFileTypes:true});console.log(JSON.stringify(e.map(d=>({name:d.name,isDirectory:d.isDirectory(),isFile:d.isFile()}))))"`,
    );
    if (!result.success) throw new Error(`readdir ${path}: ${result.stderr}`);
    return JSON.parse(result.stdout) as Dirent[];
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal },
  ): Promise<ExecResult> {
    return sshExec(
      this._host,
      this._port,
      this._user,
      command,
      cwd,
      timeoutMs,
      { keyPath: this._keyPath, password: this._password, signal: options?.signal },
    );
  }

  async execDetached(command: string, cwd: string): Promise<{ commandId: string }> {
    const result = await this._exec(`nohup ${command} > /tmp/oracle-sandbox-cmd.log 2>&1 & echo $!`);
    if (!result.success) throw new Error(`execDetached: ${result.stderr}`);
    const pid = result.stdout.trim();
    return { commandId: pid };
  }

  async stop(): Promise<void> {
    if (this._stopped) return;
    this._stopped = true;
    await this.hooks?.beforeStop?.(this);
  }

  async extendTimeout(additionalMs: number): Promise<{ expiresAt: number }> {
    // Oracle VMs don't auto-expire — track locally
    const current = this.expiresAt ?? Date.now() + (this.timeout ?? 300_000);
    return { expiresAt: current + additionalMs };
  }

  async snapshot(): Promise<SnapshotResult> {
    // Create a snapshot by archiving the workspace
    const snapshotId = `oracle-${this._instanceId}-${Date.now()}`;
    await this._exec(`tar -czf /tmp/${snapshotId}.tar.gz -C ${this.workingDirectory} .`);
    return { snapshotId };
  }

  getState(): OracleState {
    return {
      type: "oracle",
      instanceId: this._instanceId,
      host: this._host,
      port: this._port,
      user: this._user,
      keyPath: this._keyPath,
      workingDirectory: this.workingDirectory,
      currentBranch: this.currentBranch,
    };
  }
}

export async function connectOracleSandbox(
  state: OracleState,
  options?: { hooks?: SandboxHooks; env?: Record<string, string>; timeout?: number },
): Promise<Sandbox> {
  const sandbox = new OracleSandbox({
    instanceId: state.instanceId,
    host: state.host,
    port: state.port,
    user: state.user,
    keyPath: state.keyPath,
    workingDirectory: state.workingDirectory,
    currentBranch: state.currentBranch,
    hooks: options?.hooks,
    env: options?.env,
    timeout: options?.timeout,
  });

  await sandbox.hooks?.afterStart?.(sandbox);
  return sandbox;
}