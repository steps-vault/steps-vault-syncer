import type { PartyListToSync, VaultSong } from '../planner/sync-plan-types';

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
  /** The colour of the player's group on the site (green, pink, cyan, yellow, orange or purple; null: in no group), so
   * Sync draws the group's folder in it. Sites from before group colours leave it out. */
  groupColorKey?: string | null;
}

/** A party list the player syncs, as GET /api/sync/party-lists describes it. */
export interface SyncPartyList extends PartyListToSync {
  slug: string;
  /** When the list ends and its folder goes; null: no end. */
  endsAt: string | null;
  /** Its ready songs, described like vault songs; their files come from the same song routes. */
  songs: VaultSongDetails[];
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
    super('This computer is signed out of dancedance.studio. Choose "Sign in" and type the new code on dancedance.studio/link.');
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
