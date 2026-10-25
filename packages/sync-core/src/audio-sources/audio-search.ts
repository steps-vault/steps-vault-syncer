import { fetchAudioLinks, isAddonSetToMusicOnly, type InstalledAddon } from '../addons/addon-client';
import { isAddonProviding, type AddonSongFacts, type AudioLink } from '../addons/addon-protocol';
import type { HttpClient } from '../network/http-client';
import type { AudioMatch } from '../planner/sync-plan-types';
import { findMusicCandidates, type MusicIndex } from './music-library';

/**
 * Decodes a file and compares it with the song's fingerprint (task 6's checkAudioSource). Passed in because the
 * platforms run it in a Web Worker or worker thread.
 */
export type CheckAudioSource = (options: { sourceId: string }) => Promise<AudioMatch>;

/** Downloads an addon's file link into a temporary place and returns the sourceId it can be checked and copied by. */
export type DownloadAddonFile = (options: { url: string; fileName: string | null; addonName: string }) => Promise<string>;

export interface AudioSearchSong extends AddonSongFacts {
  vaultSongId: string;
}

export interface AudioSearchOptions {
  song: AudioSearchSong;
  /** The file the player chose for this song with "Choose audio…", if any. */
  pickedSourceId: string | null;
  musicIndex: MusicIndex | null;
  addons: readonly InstalledAddon[];
  httpClient: HttpClient;
  checkAudioSource: CheckAudioSource;
  downloadAddonFile: DownloadAddonFile;
}

/** What the search found, plus the addon messages and page links the song row and details can show. */
export interface AudioSearchResult {
  match: AudioMatch;
  addonMessages: string[];
  pageLinks: Extract<AudioLink, { kind: 'open-page' }>[];
}

/**
 * Finds the player's own copy of a song: the file they picked (only that one: they chose it), else music-folder files
 * with the same title and artist, else enabled addons. Every file is checked by its sound before it is used.
 */
export async function findAudioForSong(options: AudioSearchOptions): Promise<AudioSearchResult> {
  if (options.pickedSourceId !== null) return { match: await options.checkAudioSource({ sourceId: options.pickedSourceId }), addonMessages: [], pageLinks: [] };
  const folderMatch = await checkCandidates({ sourceIds: getMusicFolderSourceIds(options), checkAudioSource: options.checkAudioSource });
  if (folderMatch.kind === 'matched') return { match: folderMatch, addonMessages: [], pageLinks: [] };
  const addonResult = await searchAddons(options);
  const match = addonResult.match.kind === 'matched' || folderMatch.kind !== 'different-edit' ? addonResult.match : folderMatch;
  return { ...addonResult, match };
}

function getMusicFolderSourceIds({ musicIndex, song }: AudioSearchOptions): string[] {
  if (!musicIndex) return [];
  return findMusicCandidates({ index: musicIndex, title: song.title, artist: song.artist }).map((musicFile) => musicFile.sourceId);
}

/** The first file that matches wins; if none match but some were another edit, the song is "Different edit". */
async function checkCandidates({ sourceIds, checkAudioSource }: { sourceIds: readonly string[]; checkAudioSource: CheckAudioSource }): Promise<AudioMatch> {
  let firstDifferentEdit: AudioMatch | null = null;
  for (const sourceId of sourceIds) {
    const match = await checkAudioSource({ sourceId });
    if (match.kind === 'matched') return match;
    if (match.kind === 'different-edit') firstDifferentEdit ??= match;
  }
  return firstDifferentEdit ?? { kind: 'not-found', isWaitingForAddon: false };
}

async function searchAddons(options: AudioSearchOptions): Promise<AudioSearchResult> {
  const addonMessages: string[] = [];
  const pageLinks: AudioSearchResult['pageLinks'] = [];
  let isWaitingForAddon = false;
  let firstDifferentEdit: AudioMatch | null = null;
  for (const addon of options.addons.filter((candidate) => candidate.isEnabled && isAddonProviding({ manifest: candidate.manifest, ability: 'audio-links' }))) {
    const answer = await fetchAudioLinks({ httpClient: options.httpClient, addon, song: options.song });
    if (answer.kind !== 'links') {
      isWaitingForAddon = true;
      if (answer.kind === 'not-answering') addonMessages.push(answer.message);
      continue;
    }
    if (answer.addonError !== null) addonMessages.push(`${addon.manifest.name}: ${answer.addonError}`);
    pageLinks.push(...answer.links.filter((link) => link.kind === 'open-page'));
    const match = await checkAddonFiles({ options, links: answer.links, addonMessages, addonName: addon.manifest.name });
    if (match.kind === 'matched') return { match: await withAddonVideo({ options, match, links: answer.links, addonMessages, addon }), addonMessages, pageLinks };
    if (match.kind === 'different-edit') firstDifferentEdit ??= match;
  }
  return { match: firstDifferentEdit ?? { kind: 'not-found', isWaitingForAddon }, addonMessages, pageLinks };
}

async function checkAddonFiles({ options, links, addonMessages, addonName }: { options: AudioSearchOptions; links: readonly AudioLink[]; addonMessages: string[]; addonName: string }): Promise<AudioMatch> {
  const sourceIds: string[] = [];
  for (const link of links) {
    if (link.kind !== 'file-url' || link.media !== 'audio') continue;
    try {
      sourceIds.push(await options.downloadAddonFile({ url: link.url, fileName: link.fileName, addonName }));
    } catch {
      addonMessages.push(`${addonName}: a file couldn’t be downloaded. We’ll try again later.`);
    }
  }
  return checkCandidates({ sourceIds, checkAudioSource: options.checkAudioSource });
}

/**
 * The video is fetched only after the music from the same answer matched: both come from one upload, so the video
 * lines up with the steps using the music's shift. A video that fails to download leaves the song with music only.
 * When the player chose "Music only", a video the addon sends anyway is ignored.
 */
async function withAddonVideo(options: { options: AudioSearchOptions; match: Extract<AudioMatch, { kind: 'matched' }>; links: readonly AudioLink[]; addonMessages: string[]; addon: InstalledAddon }): Promise<AudioMatch> {
  const videoLink = options.links.find((link) => link.kind === 'file-url' && link.media === 'video');
  if (videoLink?.kind !== 'file-url' || isAddonSetToMusicOnly(options.addon)) return options.match;
  const addonName = options.addon.manifest.name;
  try {
    const videoSourceId = await options.options.downloadAddonFile({ url: videoLink.url, fileName: videoLink.fileName, addonName });
    return { ...options.match, videoSourceId };
  } catch {
    options.addonMessages.push(`${addonName}: the video couldn’t be downloaded, so the song plays without it. We’ll try again on an update.`);
    return options.match;
  }
}
