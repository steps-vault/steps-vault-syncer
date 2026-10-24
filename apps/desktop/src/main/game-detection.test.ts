import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findInstalledGames, getInstallParentFolders } from './game-detection';

let games: string;

beforeEach(async () => {
  games = await mkdtemp(path.join(os.tmpdir(), 'stepsvault-games-'));
});

afterEach(async () => {
  await rm(games, { recursive: true, force: true });
});

describe('findInstalledGames', () => {
  it('finds StepMania, LTEK Edition and ITGmania by folder name, and counts their songs', async () => {
    await mkdir(path.join(games, 'StepMania 5 LTEK Edition', 'Songs', 'DDR A20', 'Sorry'), { recursive: true });
    await mkdir(path.join(games, 'StepMania 5 LTEK Edition', 'Songs', 'DDR A20', 'Paris'), { recursive: true });
    await mkdir(path.join(games, 'ITGmania', 'Songs', 'Pop', 'Cheap Thrills'), { recursive: true });
    await mkdir(path.join(games, 'StepMania 5', 'NoSongsFolderHere'), { recursive: true });
    await mkdir(path.join(games, 'Photoshop', 'Songs'), { recursive: true });
    const found = await findInstalledGames({ parentFolders: [games, path.join(games, 'missing')] });
    expect(found.map((game) => [game.gameName, game.songCount]).sort()).toEqual([['ITGmania', 1], ['StepMania 5 LTEK Edition', 2]]);
  });

  it('looks on every fixed drive, in Games and Program Files, and in AppData', () => {
    const parents = getInstallParentFolders({ appDataFolder: 'C:\\Users\\Noa\\AppData\\Roaming' });
    expect(parents).toContain(path.join('D:\\', 'Games'));
    expect(parents).toContain(path.join('C:\\', 'Program Files (x86)'));
    expect(parents).toContain('C:\\Users\\Noa\\AppData\\Roaming');
  });
});
