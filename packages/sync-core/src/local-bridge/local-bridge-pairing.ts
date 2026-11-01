/**
 * Pairing a browser with the local bridge. The player starts it in Sync, which shows a short code; they type it on the
 * StepsVault site, whose page (in their browser) trades it here for a long random token. The token is made here and
 * goes straight to the browser, so it never passes through any server.
 */

/** No 0/O or 1/I, which players mix up when they type. 32 letters, so one random byte picks one evenly. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const TOKEN_BYTE_COUNT = 32;
export const PAIRING_CODE_LIFETIME_MILLISECONDS = 5 * 60 * 1000;
/** Wrong codes before the code is thrown away and the player has to start again in Sync. */
export const MAX_WRONG_CODES_PER_PAIRING = 5;
/** Tries of any kind per minute, so even a fresh code can't be guessed by brute force. */
export const MAX_PAIRING_TRIES_PER_MINUTE = 10;
const MINUTE_MILLISECONDS = 60 * 1000;
/** A player rarely uses more than a few browsers; the oldest pairing goes first. */
const MAX_PAIRED_BROWSERS = 20;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export interface PairedBrowser {
  token: string;
  pairedAt: string;
}

/** Where the tokens are kept; the desktop app encrypts them with the system's own protection, like the device token. */
export interface PairedBrowserStore {
  load(): Promise<PairedBrowser[]>;
  save(browsers: readonly PairedBrowser[]): Promise<void>;
}

export interface LocalBridgePairingPorts {
  store: PairedBrowserStore;
  /** Cryptographically strong random bytes. */
  getRandomBytes: (byteCount: number) => Uint8Array;
  getNowMilliseconds: () => number;
  /** Called when the code or the paired browsers change, so the app's window can show it. */
  onChange?: () => void;
}

export interface PairingCode {
  /** Shown as `ABCD-EFGH`. */
  code: string;
  expiresAtMilliseconds: number;
}

export type PairingRefusal = 'no-pairing-code' | 'wrong-code' | 'code-expired' | 'too-many-tries';

export type PairingResult = { kind: 'paired'; token: string } | { kind: 'refused'; reason: PairingRefusal };

interface PendingPairing {
  code: string;
  expiresAtMilliseconds: number;
  wrongCodeCount: number;
}

export class LocalBridgePairing {
  private readonly ports: LocalBridgePairingPorts;
  private pairedBrowsers: PairedBrowser[] = [];
  private pendingPairing: PendingPairing | null = null;
  private recentTryTimesMilliseconds: number[] = [];

  constructor(ports: LocalBridgePairingPorts) {
    this.ports = ports;
  }

  async initialize(): Promise<void> {
    this.pairedBrowsers = await this.ports.store.load().catch((): PairedBrowser[] => []);
  }

  get pairedBrowserCount(): number {
    return this.pairedBrowsers.length;
  }

  /** A new code replaces the one before. */
  startPairing(): PairingCode {
    const code = buildPairingCode(this.ports.getRandomBytes(CODE_LENGTH));
    const expiresAtMilliseconds = this.ports.getNowMilliseconds() + PAIRING_CODE_LIFETIME_MILLISECONDS;
    this.pendingPairing = { code, expiresAtMilliseconds, wrongCodeCount: 0 };
    this.ports.onChange?.();
    return { code: formatPairingCode(code), expiresAtMilliseconds };
  }

  cancelPairing(): void {
    this.pendingPairing = null;
    this.ports.onChange?.();
  }

  /** The code the player should see now; null when there is none or it expired. */
  getPendingCode(): PairingCode | null {
    const pending = this.pendingPairing;
    if (!pending || pending.expiresAtMilliseconds <= this.ports.getNowMilliseconds()) return null;
    return { code: formatPairingCode(pending.code), expiresAtMilliseconds: pending.expiresAtMilliseconds };
  }

  async pair(typedCode: string): Promise<PairingResult> {
    if (!this.takeTry()) return { kind: 'refused', reason: 'too-many-tries' };
    const pending = this.pendingPairing;
    if (!pending) return { kind: 'refused', reason: 'no-pairing-code' };
    if (pending.expiresAtMilliseconds <= this.ports.getNowMilliseconds()) {
      this.cancelPairing();
      return { kind: 'refused', reason: 'code-expired' };
    }
    if (!isSameSecret({ expected: pending.code, given: normalizePairingCode(typedCode) })) return this.refuseWrongCode(pending);
    this.pendingPairing = null;
    const token = await this.addPairedBrowser();
    this.ports.onChange?.();
    return { kind: 'paired', token };
  }

  /** Every paired token is compared in full, so the time taken says nothing about which one, or how much, matched. */
  isPairedToken(token: string): boolean {
    let isFound = false;
    for (const browser of this.pairedBrowsers) isFound = isSameSecret({ expected: browser.token, given: token }) || isFound;
    return isFound;
  }

  async forgetPairedBrowsers(): Promise<void> {
    this.pairedBrowsers = [];
    this.pendingPairing = null;
    await this.ports.store.save([]);
    this.ports.onChange?.();
  }

  private refuseWrongCode(pending: PendingPairing): PairingResult {
    pending.wrongCodeCount += 1;
    if (pending.wrongCodeCount < MAX_WRONG_CODES_PER_PAIRING) return { kind: 'refused', reason: 'wrong-code' };
    this.cancelPairing();
    return { kind: 'refused', reason: 'too-many-tries' };
  }

  private takeTry(): boolean {
    const now = this.ports.getNowMilliseconds();
    this.recentTryTimesMilliseconds = this.recentTryTimesMilliseconds.filter((tryTime) => tryTime > now - MINUTE_MILLISECONDS);
    if (this.recentTryTimesMilliseconds.length >= MAX_PAIRING_TRIES_PER_MINUTE) return false;
    this.recentTryTimesMilliseconds.push(now);
    return true;
  }

  private async addPairedBrowser(): Promise<string> {
    const token = encodeBase64Url(this.ports.getRandomBytes(TOKEN_BYTE_COUNT));
    const pairedBrowser = { token, pairedAt: new Date(this.ports.getNowMilliseconds()).toISOString() };
    this.pairedBrowsers = [...this.pairedBrowsers, pairedBrowser].slice(-MAX_PAIRED_BROWSERS);
    await this.ports.store.save(this.pairedBrowsers);
    return token;
  }
}

function buildPairingCode(randomBytes: Uint8Array): string {
  return Array.from(randomBytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? '').join('');
}

function formatPairingCode(code: string): string {
  return `${code.slice(0, CODE_LENGTH / 2)}-${code.slice(CODE_LENGTH / 2)}`;
}

/** Players type `abcd efgh` or `ABCD-EFGH`; both are the same code. */
export function normalizePairingCode(typedCode: string): string {
  return typedCode.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Compares without stopping at the first different character, so the time taken doesn't tell how much of a guess
 * was right. Characters past the end of `given` count as different.
 */
export function isSameSecret({ expected, given }: { expected: string; given: string }): boolean {
  let difference = expected.length ^ given.length;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ (index < given.length ? given.charCodeAt(index) : 0);
  return difference === 0 && expected.length > 0;
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const characterCount = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6));
    for (let position = 0; position < characterCount; position += 1) text += BASE64URL_ALPHABET[(chunk >> (18 - position * 6)) & 63] ?? '';
  }
  return text;
}
