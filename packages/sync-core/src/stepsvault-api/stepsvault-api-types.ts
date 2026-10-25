import type { VaultSong } from '../planner/sync-plan-types';

/** A song in the player's vault, as GET /api/sync/vault describes it. */
export interface VaultSongDetails extends VaultSong {
  slug: string;
  album: string | null;
  lengthSeconds: number;
  /** Beginner to Challenge; null where the site sent no level. */
  levels: (number | null)[];
  bpm: number | null;
  youtubeId: string | null;
  imageKinds: string[];
  hasFingerprint: boolean;
}

/** The signed-in player as GET /api/sync/me describes them. */
export interface SyncAccount {
  /** Each song made with StepsVault's generator spends one. */
  tokenBalance: number;
  player: { handle: string; initial: string; avatarColor: string };
}

export interface DeviceCode {
  code: string;
  expiresAt: string;
  /** The app's secret: only it can trade the linked code for a device token. Never shown or logged. */
  pollingId: string;
  pollIntervalSeconds: number;
}

export type DeviceSignInPoll =
  | { status: 'waiting' }
  /** Store the token in the system keychain (Electron safeStorage); it is shown to the app only this once. */
  | { status: 'linked'; deviceToken: string; deviceName: string }
  | { status: 'expired' };

/** The computer this app runs on, as the player sees it on the site before linking. */
export interface DeviceDescription {
  deviceName: string;
  operatingSystem: string;
  appVersion: string;
}

export class SignedOutError extends Error {
  constructor() {
    super('This computer is signed out of StepsVault. Choose "Sign in" and type the new code on stepsvault.com/link.');
    this.name = 'SignedOutError';
  }
}

export class StepsVaultApiError extends Error {
  readonly status: number;

  constructor({ status, message }: { status: number; message: string }) {
    super(message);
    this.name = 'StepsVaultApiError';
    this.status = status;
  }
}
