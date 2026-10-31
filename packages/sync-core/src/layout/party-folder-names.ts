import type { PartyFolder } from '../ownership/party-folders';
import { getNameKey } from '../songs-folder/songs-path';
import { getGroupName, getUnusedName } from './folder-layout';
import { getEnglishLettersFolderName } from './safe-folder-name';

/** Plain ASCII like every folder Sync writes: the design draws "Party · <name>", but a middle dot is missing from some
 * Windows code pages StepMania opens folders through. The site sends the same prefix in `gameFolderName`. */
export const PARTY_FOLDER_PREFIX = 'Party - ';
/** For a list named with no English letters at all, which StepMania on Windows couldn't open. */
export const UNNAMED_PARTY_LIST_NAME = 'Untitled list';

export interface PartyListFolderFacts {
  partyListId: string;
  /** "Party - <list name>" as the site sends it, before Sync's own name cleaning. */
  gameFolderName: string;
}

/** "Party - Maya's birthday"; the list's name is cleaned on its own, so "Party - 桜" becomes "Party - Untitled list". */
export function getPartyFolderBaseName(gameFolderName: string): string {
  const listName = gameFolderName.startsWith(PARTY_FOLDER_PREFIX) ? gameFolderName.slice(PARTY_FOLDER_PREFIX.length) : gameFolderName;
  const safeListName = getEnglishLettersFolderName({ name: listName, fallback: UNNAMED_PARTY_LIST_NAME });
  return getEnglishLettersFolderName({ name: `${PARTY_FOLDER_PREFIX}${safeListName}`, fallback: `${PARTY_FOLDER_PREFIX}${UNNAMED_PARTY_LIST_NAME}` });
}

export interface PartyFolderNameOptions {
  partyLists: readonly PartyListFolderFacts[];
  /** The party folders already in the game. */
  partyFolders: readonly PartyFolder[];
  /** Top-level folders in the Songs folder that Sync didn't create. */
  playerGroupNames: readonly string[];
  /** Every group Sync made (layout groups, party folders, generated songs); a new party folder never joins one. */
  ownedGroupNames: readonly string[];
}

/**
 * The game folder of each party list. A list keeps its folder while its name stays, so its songs keep their scores.
 * A new or renamed list takes the "name already yours" prefix when the player has a folder of that name, and a number
 * when another of Sync's folders has it ("Party - Game night 2"), even one being emptied in the same sync.
 */
export function getPartyFolderNames(options: PartyFolderNameOptions): Map<string, string> {
  const playerNameKeys = new Set(options.playerGroupNames.map(getNameKey));
  const takenNameKeys = new Set([...options.playerGroupNames, ...options.ownedGroupNames, ...options.partyFolders.map((partyFolder) => partyFolder.groupName)].map(getNameKey));
  const baseNamesById = new Map(options.partyLists.map((partyList) => [partyList.partyListId, getPartyFolderBaseName(partyList.gameFolderName)]));
  const groupNamesById = new Map<string, string>();
  for (const partyFolder of options.partyFolders) {
    const baseName = baseNamesById.get(partyFolder.partyListId);
    const isSameName = baseName !== undefined && getNameKey(baseName) === getNameKey(partyFolder.baseName);
    if (isSameName && !playerNameKeys.has(getNameKey(partyFolder.groupName))) groupNamesById.set(partyFolder.partyListId, partyFolder.groupName);
  }
  for (const partyList of [...options.partyLists].sort(comparePartyListsForNaming)) {
    const baseName = baseNamesById.get(partyList.partyListId);
    if (baseName === undefined || groupNamesById.has(partyList.partyListId)) continue;
    const groupName = getUnusedName({ preferredName: getGroupName({ baseName, playerGroupNames: options.playerGroupNames }), takenNameKeys });
    takenNameKeys.add(getNameKey(groupName));
    groupNamesById.set(partyList.partyListId, groupName);
  }
  return groupNamesById;
}

/** A fixed order, so two computers syncing the same lists choose the same names. */
function comparePartyListsForNaming(first: PartyListFolderFacts, second: PartyListFolderFacts): number {
  return first.partyListId < second.partyListId ? -1 : first.partyListId > second.partyListId ? 1 : 0;
}
