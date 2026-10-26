import type { SongSyncStatus } from '@stepsvault/sync-core';
import type { IconName } from '../icons/icon';
import type { SongAction } from '../sync-ui-types';

export interface SongStatusDisplay {
  label: string;
  iconName: IconName;
  meaning: string;
}

export const SONG_STATUS_DISPLAYS: Readonly<Record<SongSyncStatus, SongStatusDisplay>> = {
  'synced': { label: 'Synced', iconName: 'check', meaning: 'In your game, lined up.' },
  'syncing': { label: 'Syncing…', iconName: 'spin', meaning: 'Working now.' },
  'needs-audio': { label: 'Needs audio', iconName: 'note', meaning: 'No audio found.' },
  'different-edit': { label: 'Different edit', iconName: 'wave', meaning: 'Your file is another version, like a radio edit.' },
  'update-available': { label: 'Update available', iconName: 'up', meaning: 'Better chart ready.' },
  'you-edited-this': { label: 'You edited this', iconName: 'pencil', meaning: 'Your edits are kept. We won’t overwrite them.' },
  'removed-from-vault': { label: 'Removed from library', iconName: 'archive', meaning: 'Gone from your library.' },
};

/** Every status, in the order the chips are explained. */
export const SONG_STATUSES: readonly SongSyncStatus[] = ['synced', 'syncing', 'needs-audio', 'different-edit', 'update-available', 'you-edited-this', 'removed-from-vault'];

/** "Syncing…" has no counter: it only lasts while a sync runs. */
export const COUNTED_SONG_STATUSES: readonly SongSyncStatus[] = ['synced', 'needs-audio', 'different-edit', 'update-available', 'you-edited-this', 'removed-from-vault'];

/** Statuses that wait on the player, for the end-of-sync judgment and the tray. */
export const NEEDS_YOU_STATUSES: ReadonlySet<SongSyncStatus> = new Set(['needs-audio', 'different-edit', 'you-edited-this', 'removed-from-vault']);

export const SONG_ACTION_LABELS: Readonly<Record<SongAction, string>> = {
  'sync': 'Sync',
  'choose-audio': 'Choose audio…',
  'use-different-file': 'Use a different file…',
  'update': 'Update now',
  'keep-mine': 'Keep mine',
  'replace-with-stepsvault': 'Use library version',
  'remove-from-game': 'Remove from game',
  'keep-in-game': 'Keep',
};

const STATUS_ACTIONS_BY_STATUS: Readonly<Record<SongSyncStatus, readonly SongAction[]>> = {
  'synced': [],
  'syncing': [],
  'needs-audio': ['choose-audio'],
  'different-edit': ['use-different-file'],
  'update-available': ['update'],
  'you-edited-this': ['keep-mine', 'replace-with-stepsvault'],
  'removed-from-vault': ['remove-from-game', 'keep-in-game'],
};

export function getSongStatusActions(status: SongSyncStatus): readonly SongAction[] {
  return STATUS_ACTIONS_BY_STATUS[status];
}

export function getStatusToneClassName(status: SongSyncStatus): string {
  return `sv-sync-tone--${status}`;
}
