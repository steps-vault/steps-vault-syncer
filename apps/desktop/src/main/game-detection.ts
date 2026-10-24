import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface FoundGame {
  gameId: string;
  gameName: string;
  songsFolderPath: string;
  songCount: number;
}

/** Folder-name patterns of the games Sync knows, matched against the folders found in the usual install places. */
const GAMES = [
  { pattern: /^stepmania\s*5.*ltek/i, gameName: 'StepMania 5 LTEK Edition' },
  { pattern: /^itgmania/i, gameName: 'ITGmania' },
  { pattern: /^(project\s*)?outfox/i, gameName: 'Project OutFox' },
  { pattern: /^stepmania\s*5/i, gameName: 'StepMania 5' },
  { pattern: /^stepmania/i, gameName: 'StepMania' },
] as const;
const INSTALL_PARENT_FOLDERS = ['', 'Games', 'Program Files', 'Program Files (x86)'];
const DRIVE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Where games are usually installed: the top of each fixed drive, its Games and Program Files, and AppData. */
export function getInstallParentFolders({ appDataFolder }: { appDataFolder: string }): string[] {
  const driveFolders = DRIVE_LETTERS.flatMap((letter) => INSTALL_PARENT_FOLDERS.map((parent) => path.join(`${letter}:\\`, parent)));
  return [...driveFolders, appDataFolder];
}

export async function findInstalledGames({ parentFolders }: { parentFolders: readonly string[] }): Promise<FoundGame[]> {
  const foundGames: FoundGame[] = [];
  for (const parentFolder of parentFolders) {
    const entries = await readdir(parentFolder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const game = GAMES.find((candidate) => candidate.pattern.test(entry.name));
      const songsFolderPath = path.join(parentFolder, entry.name, 'Songs');
      if (!game || !(await isFolder(songsFolderPath))) continue;
      foundGames.push({ gameId: songsFolderPath.toLowerCase(), gameName: game.gameName, songsFolderPath, songCount: await countSongs(songsFolderPath) });
    }
  }
  return foundGames;
}

/** Songs are the folders inside each group folder. */
export async function countSongs(songsFolderPath: string): Promise<number> {
  const groups = await readdir(songsFolderPath, { withFileTypes: true }).catch(() => []);
  const songCounts = await Promise.all(groups.filter((group) => group.isDirectory()).map(async (group) => (await readdir(path.join(songsFolderPath, group.name), { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory()).length));
  return songCounts.reduce((total, count) => total + count, 0);
}

async function isFolder(folderPath: string): Promise<boolean> {
  return (await stat(folderPath).catch(() => null))?.isDirectory() ?? false;
}
