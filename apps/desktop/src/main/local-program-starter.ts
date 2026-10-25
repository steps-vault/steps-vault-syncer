import os from 'node:os';
import path from 'node:path';

/** How long a program may take to start answering its manifest. */
export const START_TIMEOUT_MILLISECONDS = 30_000;
/** A program Sync started is stopped after this long without a request. */
export const IDLE_STOP_MILLISECONDS = 10 * 60 * 1000;
const START_CHECK_EVERY_MILLISECONDS = 500;

/** A program Sync started with the player's command. */
export interface RunningProgram {
  /** Stops the program and everything it started. */
  stop(): Promise<void>;
  hasExited(): boolean;
}

/** What the starter needs from the computer, passed in so the rules can be tested without starting anything. */
export interface LocalProgramPorts {
  /** Runs exactly this command through the system's shell, in this folder. */
  startProgram(options: { command: string; folder: string }): RunningProgram;
  /** True when the address answers its manifest right now. */
  isAnswering(baseUrl: string): Promise<boolean>;
  getNowMilliseconds(): number;
  waitMilliseconds(milliseconds: number): Promise<void>;
}

interface StartedProgram {
  program: RunningProgram;
  lastRequestAt: number;
}

/**
 * Starts an addon or generator on this computer with the start command the player typed, when Sync needs it, and stops
 * it after 10 minutes without a request (addons.md, "A program on the player's computer"). Only ever runs a command
 * the player typed and confirmed, never one an addon or generator suggests.
 */
export class LocalProgramStarter {
  private readonly ports: LocalProgramPorts;
  private readonly commandsByBaseUrl = new Map<string, string>();
  private readonly programsByBaseUrl = new Map<string, StartedProgram>();
  private readonly startsByBaseUrl = new Map<string, Promise<void>>();

  constructor({ ports }: { ports: LocalProgramPorts }) {
    this.ports = ports;
  }

  /** Remembers (or, with null, forgets) the command for one address; a program already started keeps running. */
  setStartCommand({ baseUrl, command }: { baseUrl: string; command: string | null }): void {
    if (command === null) this.commandsByBaseUrl.delete(baseUrl);
    else this.commandsByBaseUrl.set(baseUrl, command);
  }

  /** Knows exactly these commands from now on; programs already started keep running until they are idle. */
  replaceStartCommands(commandsByBaseUrl: Readonly<Record<string, string>>): void {
    this.commandsByBaseUrl.clear();
    for (const [baseUrl, command] of Object.entries(commandsByBaseUrl)) this.commandsByBaseUrl.set(baseUrl, command);
  }

  /** Before a request to `url`: starts the program behind it if it has a start command and isn't answering yet. */
  async ensureRunningFor(url: string): Promise<void> {
    const baseUrl = this.findBaseUrl(url);
    if (baseUrl === null) return;
    const startedProgram = this.programsByBaseUrl.get(baseUrl);
    if (startedProgram && !startedProgram.program.hasExited()) {
      startedProgram.lastRequestAt = this.ports.getNowMilliseconds();
      return;
    }
    const start = this.startsByBaseUrl.get(baseUrl) ?? this.startOnce(baseUrl);
    this.startsByBaseUrl.set(baseUrl, start);
    await start;
  }

  /** Called every minute or so: stops each program Sync started that had no request for 10 minutes. */
  async stopIdlePrograms(): Promise<void> {
    const now = this.ports.getNowMilliseconds();
    for (const [baseUrl, startedProgram] of [...this.programsByBaseUrl]) {
      if (now - startedProgram.lastRequestAt < IDLE_STOP_MILLISECONDS && !startedProgram.program.hasExited()) continue;
      this.programsByBaseUrl.delete(baseUrl);
      await startedProgram.program.stop();
    }
  }

  /** When Sync quits, nothing it started keeps running. */
  async stopAll(): Promise<void> {
    const programs = [...this.programsByBaseUrl.values()];
    this.programsByBaseUrl.clear();
    await Promise.all(programs.map((startedProgram) => startedProgram.program.stop()));
  }

  private findBaseUrl(url: string): string | null {
    return [...this.commandsByBaseUrl.keys()].find((baseUrl) => url === baseUrl || url.startsWith(`${baseUrl}/`)) ?? null;
  }

  private async startOnce(baseUrl: string): Promise<void> {
    try {
      if (await this.ports.isAnswering(baseUrl)) return;
      const command = this.commandsByBaseUrl.get(baseUrl);
      if (command === undefined) return;
      const program = this.ports.startProgram({ command, folder: getStartCommandFolder(command) });
      await this.waitUntilAnswering({ baseUrl, program });
      this.programsByBaseUrl.set(baseUrl, { program, lastRequestAt: this.ports.getNowMilliseconds() });
    } finally {
      this.startsByBaseUrl.delete(baseUrl);
    }
  }

  private async waitUntilAnswering({ baseUrl, program }: { baseUrl: string; program: RunningProgram }): Promise<void> {
    const startedAt = this.ports.getNowMilliseconds();
    while (this.ports.getNowMilliseconds() - startedAt < START_TIMEOUT_MILLISECONDS && !program.hasExited()) {
      await this.ports.waitMilliseconds(START_CHECK_EVERY_MILLISECONDS);
      if (await this.ports.isAnswering(baseUrl)) return;
    }
    await program.stop();
    throw new Error(`The program for ${baseUrl} didn’t answer within ${String(START_TIMEOUT_MILLISECONDS / 1000)} seconds of starting. Check its start command, or start it yourself.`);
  }
}

/**
 * The program's own folder: where the command's first word (the program or script, maybe in quotes) lives. A command
 * that names no folder, such as `node server.js`, runs in the player's home folder.
 */
export function getStartCommandFolder(command: string): string {
  const trimmedCommand = command.trim();
  const firstWord = trimmedCommand.startsWith('"') ? trimmedCommand.slice(1).split('"')[0] : trimmedCommand.split(/\s+/)[0];
  if (!firstWord) return os.homedir();
  if (path.isAbsolute(firstWord)) return path.dirname(firstWord);
  return path.win32.isAbsolute(firstWord) ? path.win32.dirname(firstWord) : os.homedir();
}
