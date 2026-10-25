import { checkGeneratedSsc, type CheckedGeneratedSsc } from '../generators/generated-song-check';
import { findSameVaultSong, getGeneratedSongKey, type VaultSongIdentity } from '../generators/generated-song-identity';
import { getGeneratedSongFolderNames } from '../generators/generated-song-folder-name';
import { buildGeneratedSongSsc, type GeneratedSongFileNames } from '../generators/generated-song-ssc';
import type { GeneratedSongFiles } from '../generators/generator-files';
import type { GeneratorDifficulty, GeneratorManifest, GeneratorSongFacts } from '../generators/generator-protocol';
import { isPngPicture, PICTURE_SIZES_BY_KIND, SONG_PICTURE_KINDS, type PictureMaker, type ReadDownloadedPicture, type SongPictureKind } from '../generators/song-pictures';
import { getGroupName, getNewSongFolderName, type SongFolderNames } from '../layout/folder-layout';
import { getPlayerGroupNames } from '../layout/player-groups';
import { buildGeneratedSongMarkerText, getGeneratedSongFolderState } from '../ownership/generated-song-marker';
import { findGeneratedSong, withGeneratedSong, type GeneratedSong } from '../ownership/generated-songs';
import { withOwnedGroup, type InstalledSongsRecord } from '../ownership/installed-songs';
import { SONG_FOLDER_MARKER_FILE_NAME } from '../ownership/song-folder-marker';
import type { SongsFolder } from '../songs-folder/songs-folder';
import { buildSongsPath, getNameKey, type SongsPath } from '../songs-folder/songs-path';
import { MUSIC_BASE_NAME, removeQuietly, TEMPORARY_FOLDER_PREFIX, VIDEO_BASE_NAME } from './song-writer';
import { SongWriteError, toSongWriteError } from './song-write-error';

/** Where songs from community generators go; see "Where generated songs go" in generators.md. */
export const GENERATED_SONGS_GROUP_NAME = 'My generated songs';
const REPLACED_FOLDER_PREFIX = '.stepsvault-old-';

/** The player's answer to "keep the vault song, or the generated one?" */
export type VaultSongChoice = 'keep-vault-song' | 'keep-generated-song';

export interface GeneratedSongWriterDependencies {
  songsFolder: SongsFolder;
  readDownloadedPicture: ReadDownloadedPicture;
  /** Null until the platform can draw pictures: a picture the generator didn't send is then left out of the song. */
  pictureMaker: PictureMaker | null;
  createId: () => string;
  getNow: () => string;
}

/** A finished job, ready to go into the game. */
export interface GeneratedSongRequest {
  generator: Pick<GeneratorManifest, 'id' | 'name' | 'version'>;
  song: GeneratorSongFacts;
  difficulties: readonly GeneratorDifficulty[];
  files: GeneratedSongFiles;
  /** The music the player gave the generator; it goes into the game when the generator sent no music. */
  playerMusicSourceId: string;
  /** The video that came with the player's music (from an addon), or null. A video from the generator comes first. */
  playerVideoSourceId: string | null;
}

export type GeneratedSongWriteResult =
  | { kind: 'written'; record: InstalledSongsRecord; generatedSong: GeneratedSong; wasReplaced: boolean }
  /** Nothing was written: ask the player `question`, then call again with their VaultSongChoice. */
  | { kind: 'needs-vault-choice'; vaultSongId: string; question: string }
  /** The player kept the vault song, so nothing was written. */
  | { kind: 'kept-vault-song'; record: InstalledSongsRecord };

export interface WriteGeneratedSongOptions {
  dependencies: GeneratedSongWriterDependencies;
  record: InstalledSongsRecord;
  request: GeneratedSongRequest;
  /** The player's vault, to notice the same song there. */
  vaultSongs: readonly VaultSongIdentity[];
  /** Given on the second call, after a 'needs-vault-choice' result. */
  vaultSongChoice?: VaultSongChoice | null;
}

/**
 * Checks a generator's song file and writes the song into "My generated songs" under Sync's own file names. Making the
 * same song again replaces the earlier version in the same folder. Throws GeneratorError when the song file is
 * refused and SongWriteError when the song couldn't be written; either way the game is left as it was.
 */
export async function writeGeneratedSong(options: WriteGeneratedSongOptions): Promise<GeneratedSongWriteResult> {
  const { request, record, vaultSongChoice } = options;
  const checkedSsc = checkGeneratedSsc({ chartText: request.files.chartText, difficulties: request.difficulties, generatorName: request.generator.name });
  const sameVaultSong = findSameVaultSong({ song: request.song, vaultSongs: options.vaultSongs });
  if (sameVaultSong && !vaultSongChoice) return { kind: 'needs-vault-choice', vaultSongId: sameVaultSong.vaultSongId, question: `“${sameVaultSong.title}” is also in your vault. Which one do you want in your game: the vault song or the one you made?` };
  if (sameVaultSong && vaultSongChoice === 'keep-vault-song') return { kind: 'kept-vault-song', record };
  return writeCheckedSong({ options, checkedSsc, inPlaceOfVaultSongId: sameVaultSong?.vaultSongId ?? null });
}

async function writeCheckedSong({ options, checkedSsc, inPlaceOfVaultSongId }: { options: WriteGeneratedSongOptions; checkedSsc: CheckedGeneratedSsc; inPlaceOfVaultSongId: string | null }): Promise<GeneratedSongWriteResult> {
  const { dependencies, record, request } = options;
  const replacedSong = await getReplaceableSong({ songsFolder: dependencies.songsFolder, record, songKey: getGeneratedSongKey(request.song) });
  const folderPath = replacedSong?.folderPath ?? (await chooseNewFolderPath({ songsFolder: dependencies.songsFolder, record, songNames: getGeneratedSongFolderNames({ headerText: checkedSsc.headerText, song: request.song, now: dependencies.getNow() }) }));
  const generatedSong = buildGeneratedSong({ dependencies, request, folderPath, inPlaceOfVaultSongId });
  await writeSongFolder({ dependencies, request, checkedSsc, generatedSong, isReplacing: replacedSong !== null });
  const recordWithSong = withGeneratedSong({ record, generatedSong });
  return { kind: 'written', record: withOwnedGroup({ record: recordWithSong, groupName: folderPath[0] ?? GENERATED_SONGS_GROUP_NAME }), generatedSong, wasReplaced: replacedSong !== null };
}

/** The earlier version of this song, when its folder is still the one Sync wrote; a folder the player replaced is left alone. */
async function getReplaceableSong({ songsFolder, record, songKey }: { songsFolder: SongsFolder; record: InstalledSongsRecord; songKey: string }): Promise<GeneratedSong | null> {
  const earlierSong = findGeneratedSong({ record, songKey });
  if (!earlierSong) return null;
  return (await getGeneratedSongFolderState({ songsFolder, generatedSong: earlierSong })) === 'ours' ? earlierSong : null;
}

async function chooseNewFolderPath({ songsFolder, record, songNames }: { songsFolder: SongsFolder; record: InstalledSongsRecord; songNames: SongFolderNames }): Promise<SongsPath> {
  const groupName = getGroupName({ baseName: GENERATED_SONGS_GROUP_NAME, playerGroupNames: await getPlayerGroupNames({ songsFolder, record }) });
  const entries = await songsFolder.listEntries(buildSongsPath(groupName));
  return buildSongsPath(groupName, getNewSongFolderName({ song: songNames, takenNameKeys: new Set(entries.map((entry) => getNameKey(entry.name))) }));
}

function buildGeneratedSong({ dependencies, request, folderPath, inPlaceOfVaultSongId }: { dependencies: GeneratedSongWriterDependencies; request: GeneratedSongRequest; folderPath: SongsPath; inPlaceOfVaultSongId: string | null }): GeneratedSong {
  const { generator, song, difficulties } = request;
  return { songKey: getGeneratedSongKey(song), song, generatorId: generator.id, generatorVersion: generator.version, generatorName: generator.name, difficulties: [...difficulties], installId: dependencies.createId(), folderPath, inPlaceOfVaultSongId, generatedAt: dependencies.getNow() };
}

/** Everything goes into a hidden folder first and is renamed into place last, so the game never sees a half-written song. */
async function writeSongFolder(options: { dependencies: GeneratedSongWriterDependencies; request: GeneratedSongRequest; checkedSsc: CheckedGeneratedSsc; generatedSong: GeneratedSong; isReplacing: boolean }): Promise<void> {
  const { dependencies: { songsFolder }, generatedSong } = options;
  const [groupName, folderName] = generatedSong.folderPath;
  if (groupName === undefined || folderName === undefined) throw new SongWriteError({ failure: 'other', message: 'A generated song can only be written as a group and a song folder. This is a bug in Sync; please report it.' });
  const temporaryPath = buildSongsPath(groupName, `${TEMPORARY_FOLDER_PREFIX}${generatedSong.installId}`);
  try {
    const fileNames = await writeSongFiles({ dependencies: options.dependencies, request: options.request, folder: temporaryPath });
    await songsFolder.writeText({ path: [...temporaryPath, `${folderName}.ssc`], text: buildGeneratedSongSsc({ checkedSsc: options.checkedSsc, fileNames }) });
    await songsFolder.writeText({ path: [...temporaryPath, SONG_FOLDER_MARKER_FILE_NAME], text: buildGeneratedSongMarkerText(generatedSong) });
    await moveIntoPlace({ songsFolder, temporaryPath, generatedSong, isReplacing: options.isReplacing });
  } catch (error) {
    await removeQuietly({ songsFolder, path: temporaryPath });
    throw toSongWriteError(error);
  }
}

async function writeSongFiles({ dependencies, request, folder }: { dependencies: GeneratedSongWriterDependencies; request: GeneratedSongRequest; folder: SongsPath }): Promise<GeneratedSongFileNames> {
  const { songsFolder } = dependencies;
  const { sourceIdByKind } = request.files;
  const musicFileName = await songsFolder.copyMusic({ sourceId: sourceIdByKind.music ?? request.playerMusicSourceId, folder, baseName: MUSIC_BASE_NAME });
  // The player's video is timed on the player's music, so it plays only with that music.
  const videoSourceId = sourceIdByKind.video ?? (sourceIdByKind.music === undefined ? request.playerVideoSourceId : null);
  const videoFileName = videoSourceId === null ? null : await songsFolder.copyVideo({ sourceId: videoSourceId, folder, baseName: VIDEO_BASE_NAME });
  return { musicFileName, videoFileName, pictureFileNamesByKind: await writePictures({ dependencies, request, folder }) };
}

async function writePictures({ dependencies, request, folder }: { dependencies: GeneratedSongWriterDependencies; request: GeneratedSongRequest; folder: SongsPath }): Promise<Partial<Record<SongPictureKind, string>>> {
  const pictureFileNamesByKind: Partial<Record<SongPictureKind, string>> = {};
  for (const kind of SONG_PICTURE_KINDS) {
    const bytes = await getPictureBytes({ dependencies, request, kind });
    if (bytes === null) continue;
    const fileName = `${kind}.png`;
    await dependencies.songsFolder.writeBytes({ path: [...folder, fileName], bytes });
    pictureFileNamesByKind[kind] = fileName;
  }
  return pictureFileNamesByKind;
}

/** The generator's picture when it is a real PNG, else a plain one, else none. */
async function getPictureBytes({ dependencies, request, kind }: { dependencies: GeneratedSongWriterDependencies; request: GeneratedSongRequest; kind: SongPictureKind }): Promise<Uint8Array | null> {
  const sourceId = request.files.sourceIdByKind[kind];
  const sentBytes = sourceId === undefined ? null : await dependencies.readDownloadedPicture(sourceId);
  if (sentBytes !== null && isPngPicture(sentBytes)) return sentBytes;
  if (!dependencies.pictureMaker) return null;
  return dependencies.pictureMaker.makePlainPicture({ kind, ...PICTURE_SIZES_BY_KIND[kind], title: request.song.title, artist: request.song.artist });
}

/** A replaced song is moved aside, not removed, until the new one is in place, so a failure puts it back. */
async function moveIntoPlace({ songsFolder, temporaryPath, generatedSong, isReplacing }: { songsFolder: SongsFolder; temporaryPath: SongsPath; generatedSong: GeneratedSong; isReplacing: boolean }): Promise<void> {
  const { folderPath } = generatedSong;
  if (!isReplacing) return songsFolder.rename({ from: temporaryPath, to: folderPath });
  const replacedPath = buildSongsPath(...folderPath.slice(0, -1), `${REPLACED_FOLDER_PREFIX}${generatedSong.installId}`);
  await songsFolder.rename({ from: folderPath, to: replacedPath });
  try {
    await songsFolder.rename({ from: temporaryPath, to: folderPath });
  } catch (error) {
    await songsFolder.rename({ from: replacedPath, to: folderPath });
    throw error;
  }
  await removeQuietly({ songsFolder, path: replacedPath });
}
