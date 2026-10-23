import { describe, expect, it } from 'vitest';
import type { FolderLayout } from '../layout/folder-layout';
import { getPlayerGroupNames } from '../layout/player-groups';
import { getChartHash } from '../ownership/chart-hash';
import { checkInstalledSongs } from '../ownership/installed-song-check';
import { buildEmptyInstalledSongsRecord, findInstalledSong, withInstalledSong, withOwnedGroup, withoutInstalledSong, type InstalledSongsRecord } from '../ownership/installed-songs';
import { buildSongFolderMarkerText, SONG_FOLDER_MARKER_FILE_NAME } from '../ownership/song-folder-marker';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import type { SongsPath } from '../songs-folder/songs-path';
import { buildSyncPlan, type SyncPlanInput } from './sync-planner';
import type { AudioMatch, PlayerChoices, SyncAction, SyncPlan, VaultSong } from './sync-plan-types';

const CHEAP_THRILLS: VaultSong = { vaultSongId: 'a', title: 'Cheap Thrills', artist: 'Sia', genre: 'Pop', chartVersion: 'v1' };
const WATCH_ME: VaultSong = { vaultSongId: 'b', title: 'Watch Me', artist: 'Silentó', genre: 'Hip-Hop', chartVersion: 'v1' };
const MATCHED: AudioMatch = { kind: 'matched', sourceId: 'music-folder:cheap-thrills.mp3', shiftSeconds: 0.18 };
const NO_CHOICES: PlayerChoices = { replaceEditedSongIds: new Set(), removeFromGameSongIds: new Set(), updateSongIds: new Set() };

/** A game folder and the record, as a real sync would leave them; `carryOut` is a pretend executor for the plan. */
class TestGame {
  readonly songsFolder = new MemorySongsFolder();
  record: InstalledSongsRecord = buildEmptyInstalledSongsRecord();
  private installCount = 0;

  async plan(overrides: Partial<SyncPlanInput> & { vaultSongs: VaultSong[]; layout?: FolderLayout }): Promise<SyncPlan> {
    return buildSyncPlan({
      record: this.record,
      checks: await checkInstalledSongs({ songsFolder: this.songsFolder, record: this.record }),
      audioMatchesBySongId: new Map(overrides.vaultSongs.map((song) => [song.vaultSongId, MATCHED])),
      layout: 'one-group',
      playerGroupNames: await getPlayerGroupNames({ songsFolder: this.songsFolder, record: this.record }),
      choices: NO_CHOICES,
      shouldUpdateAutomatically: true,
      ...overrides,
    });
  }

  async carryOut(plan: SyncPlan): Promise<void> {
    for (const action of [...plan.forgetActions, ...plan.songPlans.flatMap((songPlan) => songPlan.actions)]) await this.carryOutAction(action);
  }

  async editChart(vaultSongId: string): Promise<void> {
    const folderPath = this.getFolderPath(vaultSongId);
    await this.songsFolder.writeText({ path: [...folderPath, 'song.ssc'], text: 'the player changed the steps' });
  }

  getFolderPath(vaultSongId: string): SongsPath {
    const installedSong = findInstalledSong({ record: this.record, vaultSongId });
    if (!installedSong) throw new Error(`${vaultSongId} is not installed`);
    return installedSong.folderPath;
  }

  private async carryOutAction(action: SyncAction): Promise<void> {
    if (action.kind === 'add') await this.writeSong({ vaultSongId: action.vaultSongId, folderPath: action.to, chartVersion: action.chartVersion });
    if (action.kind === 'update') await this.writeSong({ vaultSongId: action.vaultSongId, folderPath: action.at, chartVersion: action.chartVersion });
    if (action.kind === 'move') await this.moveSong(action);
    if (action.kind === 'remove') await this.songsFolder.removeFolder(action.at);
    if (action.kind === 'remove' || action.kind === 'forget') this.record = withoutInstalledSong({ record: this.record, vaultSongId: action.vaultSongId });
  }

  private async writeSong({ vaultSongId, folderPath, chartVersion }: { vaultSongId: string; folderPath: SongsPath; chartVersion: string }): Promise<void> {
    this.installCount += 1;
    const chartText = `#VERSION:${chartVersion};`;
    const installedSong = { vaultSongId, chartVersion, folderPath, installId: `install-${this.installCount}`, chartHashesByFileName: { 'song.ssc': getChartHash(chartText) }, music: { fileName: 'song.ogg', shiftSeconds: 0.18 }, installedAt: '2026-10-24T10:00:00Z' };
    await this.songsFolder.writeText({ path: [...folderPath, 'song.ssc'], text: chartText });
    await this.songsFolder.writeText({ path: [...folderPath, SONG_FOLDER_MARKER_FILE_NAME], text: buildSongFolderMarkerText(installedSong) });
    this.record = withOwnedGroup({ record: withInstalledSong({ record: this.record, installedSong }), groupName: folderPath[0] ?? '' });
  }

  private async moveSong(action: Extract<SyncAction, { kind: 'move' }>): Promise<void> {
    await this.songsFolder.rename({ from: action.from, to: action.to });
    const installedSong = findInstalledSong({ record: this.record, vaultSongId: action.vaultSongId });
    if (!installedSong) return;
    this.record = withOwnedGroup({ record: withInstalledSong({ record: this.record, installedSong: { ...installedSong, folderPath: action.to } }), groupName: action.to[0] ?? '' });
  }
}

function getSongPlan({ plan, vaultSongId }: { plan: SyncPlan; vaultSongId: string }) {
  return plan.songPlans.find((songPlan) => songPlan.vaultSongId === vaultSongId);
}

async function buildSyncedGame(vaultSongs: VaultSong[]): Promise<TestGame> {
  const game = new TestGame();
  await game.carryOut(await game.plan({ vaultSongs }));
  return game;
}

describe('a song not in the game yet', () => {
  it('is added when its audio matched', async () => {
    const plan = await new TestGame().plan({ vaultSongs: [CHEAP_THRILLS] });
    expect(getSongPlan({ plan, vaultSongId: 'a' })).toMatchObject({ status: 'syncing', actions: [{ kind: 'add', to: ['StepsVault', 'Cheap Thrills'], audio: { shiftSeconds: 0.18 } }] });
  });

  it('needs audio when none was found, and says when it waits for an addon', async () => {
    const plan = await new TestGame().plan({ vaultSongs: [CHEAP_THRILLS], audioMatchesBySongId: new Map([['a', { kind: 'not-found', isWaitingForAddon: true }]]) });
    expect(getSongPlan({ plan, vaultSongId: 'a' })).toMatchObject({ status: 'needs-audio', actions: [], isWaitingForAddon: true });
  });

  it('is a different edit when the only audio found is another version', async () => {
    const plan = await new TestGame().plan({ vaultSongs: [CHEAP_THRILLS], audioMatchesBySongId: new Map([['a', { kind: 'different-edit', sourceId: 'radio-edit.mp3' }]]) });
    expect(getSongPlan({ plan, vaultSongId: 'a' })).toMatchObject({ status: 'different-edit', actions: [] });
  });
});

describe('an installed song', () => {
  it('is synced when nothing changed', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    expect(getSongPlan({ plan: await game.plan({ vaultSongs: [CHEAP_THRILLS] }), vaultSongId: 'a' })).toMatchObject({ status: 'synced', actions: [] });
  });

  it('updates by itself when its steps changed, or waits for the player when automatic updates are off', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    const newSteps = { ...CHEAP_THRILLS, chartVersion: 'v2' };
    expect(getSongPlan({ plan: await game.plan({ vaultSongs: [newSteps] }), vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'update', chartVersion: 'v2' }]);
    expect(getSongPlan({ plan: await game.plan({ vaultSongs: [newSteps], shouldUpdateAutomatically: false }), vaultSongId: 'a' })).toMatchObject({ status: 'update-available', actions: [] });
    const chosen = await game.plan({ vaultSongs: [newSteps], shouldUpdateAutomatically: false, choices: { ...NO_CHOICES, updateSongIds: new Set(['a']) } });
    expect(getSongPlan({ plan: chosen, vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'update' }]);
  });

  it('keeps the player edits, even when new steps arrive, until they choose to replace them', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    await game.editChart('a');
    const newSteps = { ...CHEAP_THRILLS, chartVersion: 'v2' };
    expect(getSongPlan({ plan: await game.plan({ vaultSongs: [newSteps] }), vaultSongId: 'a' })).toMatchObject({ status: 'you-edited-this', actions: [] });
    const replacing = await game.plan({ vaultSongs: [CHEAP_THRILLS], choices: { ...NO_CHOICES, replaceEditedSongIds: new Set(['a']) } });
    expect(getSongPlan({ plan: replacing, vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'update', chartVersion: 'v1' }]);
  });

  it('stays in the game when it leaves the vault, until the player chooses to remove it', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    expect(getSongPlan({ plan: await game.plan({ vaultSongs: [] }), vaultSongId: 'a' })).toMatchObject({ status: 'removed-from-vault', actions: [] });
    const removing = await game.plan({ vaultSongs: [], choices: { ...NO_CHOICES, removeFromGameSongIds: new Set(['a']) } });
    expect(getSongPlan({ plan: removing, vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'remove', at: ['StepsVault', 'Cheap Thrills'] }]);
  });

  it('is added again when the player deleted its folder', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    await game.songsFolder.removeFolder(game.getFolderPath('a'));
    expect(getSongPlan({ plan: await game.plan({ vaultSongs: [CHEAP_THRILLS] }), vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'forget' }, { kind: 'add', to: ['StepsVault', 'Cheap Thrills'] }]);
  });

  it('never touches a folder the player replaced, and installs again next to it', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    const folderPath = game.getFolderPath('a');
    await game.songsFolder.removeFolder(folderPath);
    await game.songsFolder.writeText({ path: [...folderPath, 'their.ssc'], text: 'the player own song' });
    const plan = await game.plan({ vaultSongs: [CHEAP_THRILLS] });
    expect(getSongPlan({ plan, vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'forget' }, { kind: 'add', to: ['StepsVault', 'Cheap Thrills (Sia)'] }]);
    await game.carryOut(plan);
    expect(await game.songsFolder.readText([...folderPath, 'their.ssc'])).toBe('the player own song');
  });

  it('is forgotten without a row when it left the vault and its folder is gone', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS]);
    await game.songsFolder.removeFolder(game.getFolderPath('a'));
    const plan = await game.plan({ vaultSongs: [] });
    expect(plan.songPlans).toEqual([]);
    expect(plan.forgetActions).toEqual([{ kind: 'forget', vaultSongId: 'a' }]);
  });

  it('moves with a layout change; an edited song moves too but never updates', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS, WATCH_ME]);
    await game.editChart('b');
    const plan = await game.plan({ vaultSongs: [CHEAP_THRILLS, { ...WATCH_ME, chartVersion: 'v2' }], layout: 'by-genre' });
    expect(getSongPlan({ plan, vaultSongId: 'a' })?.actions).toMatchObject([{ kind: 'move', to: ['Pop', 'Cheap Thrills'] }]);
    expect(getSongPlan({ plan, vaultSongId: 'b' })?.actions).toMatchObject([{ kind: 'move', to: ['Hip-Hop', 'Watch Me'] }]);
  });
});

describe('carrying out a plan', () => {
  it('leaves nothing to do the second time', async () => {
    const game = await buildSyncedGame([CHEAP_THRILLS, WATCH_ME]);
    const vaultSongs = [{ ...CHEAP_THRILLS, chartVersion: 'v2' }, { vaultSongId: 'c', title: 'Sorry', artist: 'Justin Bieber', genre: 'Pop', chartVersion: 'v1' }];
    const options = { vaultSongs, layout: 'by-artist' as const, choices: { ...NO_CHOICES, removeFromGameSongIds: new Set(['b']) } };
    await game.carryOut(await game.plan(options));
    const secondPlan = await game.plan(options);
    expect(secondPlan.songPlans.flatMap((songPlan) => songPlan.actions)).toEqual([]);
    expect(secondPlan.forgetActions).toEqual([]);
    expect(secondPlan.songPlans.map((songPlan) => songPlan.status)).toEqual(['synced', 'synced']);
  });
});
