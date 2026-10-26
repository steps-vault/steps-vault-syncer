import { randomUUID } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getFileNameFacts,
  getMusicFileFacts,
  InvalidSongSourceInputError,
  MAX_GENERATOR_MUSIC_BYTES,
  MAX_GENERATOR_VIDEO_BYTES,
  searchMusicIndex,
  waitForSongSource,
  type GeneratorManifest,
  type GeneratorSongFacts,
  type GeneratorUploadFile,
  type HttpClient,
  type InstalledAddon,
  type MusicIndex,
  type SongSourceFileLink,
  type SongSourceSong,
} from '@stepsvault/sync-core';
import type { MusicChoiceView, SongSourceSearchResult } from '@stepsvault/sync-ui';
import type { MusicSourceRegistry } from './music-source-registry';

const UNKNOWN_ARTIST = 'Unknown artist';
const WAV_CONTENT_TYPE = 'audio/wav';
const STOP_CHECK_EVERY_MILLISECONDS = 250;
/** The music types the player's files have, by extension; anything else is sent as WAV when the generator takes it. */
const MUSIC_CONTENT_TYPES_BY_EXTENSION: Readonly<Record<string, string>> = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/opus', webm: 'audio/webm' };
const KNOWN_MUSIC_EXTENSIONS = new Set(Object.keys(MUSIC_CONTENT_TYPES_BY_EXTENSION));
const KNOWN_VIDEO_EXTENSIONS = new Set(['mp4', 'm4v']);

/** Music the player picked: a file on this computer, or a song a song source found (downloaded only when it is made). */
type MusicChoice =
  | { kind: 'file'; filePath: string; title: string; artist: string }
  | { kind: 'song-source'; addonName: string; song: SongSourceSong; musicLink: SongSourceFileLink; videoLink: SongSourceFileLink | null };

/** What the platform does for the Make a song page: decode, convert, download. */
export interface MakeSongMusicPorts {
  httpClient: HttpClient;
  musicSources: MusicSourceRegistry;
  measureLength(bytes: Uint8Array): Promise<number>;
  convertToWav(bytes: Uint8Array): Promise<Uint8Array>;
  downloadFile(options: { url: string; filePath: string; maxBytes: number }): Promise<void>;
  waitMilliseconds(milliseconds: number): Promise<void>;
}

/** The music of a song to make, ready to send: the right type for the generator, its length measured. */
export interface PreparedMusic {
  song: GeneratorSongFacts;
  music: GeneratorUploadFile;
  video: GeneratorUploadFile | null;
  /** The music and video that go into the game: the player's own file, or the song source's download. */
  playerMusicLocation: string;
  playerVideoLocation: string | null;
}

/**
 * The music side of the Make a song page: the player's files, their music folders, and song sources. The window only
 * ever sees a musicId; files are picked in the app's own dialog or found in folders the player chose.
 */
export class MakeSongMusic {
  private readonly ports: MakeSongMusicPorts;
  private readonly choicesById = new Map<string, MusicChoice>();
  private isSongSearchStopped = false;

  constructor(ports: MakeSongMusicPorts) {
    this.ports = ports;
  }

  /** A file the player picked in the app's own dialog. */
  addPickedFile(filePath: string): MusicChoiceView {
    const fileName = path.basename(filePath);
    const { title, artist } = getFileNameFacts(fileName);
    return this.addFileChoice({ musicId: this.ports.musicSources.register(filePath), filePath, title, artist: artist ?? UNKNOWN_ARTIST, sourceText: fileName });
  }

  /** Music in the folders Sync already scanned, by the words the player typed. */
  searchMusicFolders({ index, query }: { index: MusicIndex | null; query: string }): MusicChoiceView[] {
    if (!index) return [];
    return searchMusicIndex({ index, query }).flatMap((musicFile) => {
      const filePath = this.ports.musicSources.getSource(musicFile.sourceId)?.filePath;
      if (filePath === undefined) return [];
      const { title, artist } = getMusicFileFacts(musicFile);
      return [this.addFileChoice({ musicId: musicFile.sourceId, filePath, title, artist: artist ?? UNKNOWN_ARTIST, sourceText: [...musicFile.folderNames, musicFile.fileName].join('\\') })];
    });
  }

  /** Asks a song source for the song the player described, as long as it keeps working on it or until stopped. Each song it found becomes a choice; nothing is downloaded until one is made. */
  async findSong({ addon, valuesByInputId }: { addon: InstalledAddon; valuesByInputId: Readonly<Record<string, string>> }): Promise<SongSourceSearchResult> {
    this.isSongSearchStopped = false;
    try {
      const result = await waitForSongSource({ httpClient: this.ports.httpClient, addon, valuesByInputId, waitSeconds: (seconds) => this.waitUnlessStopped(seconds), shouldStop: () => this.isSongSearchStopped });
      if (result.kind === 'found') return { kind: 'found', musics: result.choices.map((choice) => this.addSongSourceChoice({ addonName: addon.manifest.name, ...choice })) };
      if (result.kind === 'not-found') return { kind: 'not-found', message: result.addonError };
      return result;
    } catch (error) {
      if (error instanceof InvalidSongSourceInputError) return { kind: 'invalid-input', inputId: error.inputId, message: error.message };
      return { kind: 'not-answering', message: error instanceof Error ? error.message : `${addon.manifest.name} isn’t answering. Try again in a few minutes.` };
    }
  }

  stopFindingSong(): void {
    this.isSongSearchStopped = true;
  }

  /** Gets the music ready for this generator, into the job's folder when it must be downloaded or converted. */
  async prepareMusic({ musicId, manifest, jobFolder }: { musicId: string; manifest: GeneratorManifest; jobFolder: string }): Promise<PreparedMusic> {
    const choice = this.choicesById.get(musicId);
    if (!choice) throw new Error('Sync lost the music you picked. Pick it again.');
    const files = choice.kind === 'file' ? { musicPath: choice.filePath, videoPath: null } : await this.downloadSongSourceFiles({ choice, jobFolder });
    const musicBytes = new Uint8Array(await readFile(files.musicPath));
    const lengthSeconds = choice.kind === 'song-source' && choice.song.lengthSeconds !== null ? choice.song.lengthSeconds : Math.round(await this.ports.measureLength(musicBytes));
    return {
      song: buildSongFacts({ choice, lengthSeconds }),
      music: await this.buildMusicUpload({ musicPath: files.musicPath, musicBytes, manifest, jobFolder }),
      video: files.videoPath === null ? null : await this.buildUploadFile({ filePath: files.videoPath, contentType: 'video/mp4' }),
      playerMusicLocation: files.musicPath,
      playerVideoLocation: files.videoPath,
    };
  }

  private addFileChoice({ musicId, filePath, title, artist, sourceText }: { musicId: string; filePath: string; title: string; artist: string; sourceText: string }): MusicChoiceView {
    this.choicesById.set(musicId, { kind: 'file', filePath, title, artist });
    return { musicId, title, artist, sourceText, lengthText: null, hasVideo: false };
  }

  private addSongSourceChoice({ addonName, song, musicLink, videoLink }: { addonName: string; song: SongSourceSong; musicLink: SongSourceFileLink; videoLink: SongSourceFileLink | null }): MusicChoiceView {
    const musicId = `found:${randomUUID()}`;
    this.choicesById.set(musicId, { kind: 'song-source', addonName, song, musicLink, videoLink });
    return { musicId, title: song.title, artist: song.artist, sourceText: `From ${addonName}`, lengthText: song.lengthSeconds === null ? null : formatLength(song.lengthSeconds), hasVideo: videoLink !== null };
  }

  /** Song-source files are trusted without a sound check (addons.md): there is nothing to compare a new song with. */
  private async downloadSongSourceFiles({ choice, jobFolder }: { choice: Extract<MusicChoice, { kind: 'song-source' }>; jobFolder: string }): Promise<{ musicPath: string; videoPath: string | null }> {
    const musicPath = path.join(jobFolder, `source-music.${getLinkExtension({ link: choice.musicLink, knownExtensions: KNOWN_MUSIC_EXTENSIONS, fallback: 'ogg' })}`);
    await this.ports.downloadFile({ url: choice.musicLink.url, filePath: musicPath, maxBytes: MAX_GENERATOR_MUSIC_BYTES });
    if (!choice.videoLink) return { musicPath, videoPath: null };
    const videoPath = path.join(jobFolder, `source-video.${getLinkExtension({ link: choice.videoLink, knownExtensions: KNOWN_VIDEO_EXTENSIONS, fallback: 'mp4' })}`);
    // The video is an extra: the song is still made without it.
    const isVideoDownloaded = await this.ports.downloadFile({ url: choice.videoLink.url, filePath: videoPath, maxBytes: MAX_GENERATOR_VIDEO_BYTES }).then(() => true, () => false);
    return { musicPath, videoPath: isVideoDownloaded ? videoPath : null };
  }

  /**
   * The player's file as it is when the generator takes its type; else WAV when it takes WAV. Every generator takes Ogg
   * Vorbis, but Sync has no Ogg encoder, so a generator that takes neither the file's type nor WAV can't make it.
   */
  private async buildMusicUpload({ musicPath, musicBytes, manifest, jobFolder }: { musicPath: string; musicBytes: Uint8Array; manifest: GeneratorManifest; jobFolder: string }): Promise<GeneratorUploadFile> {
    const contentType = MUSIC_CONTENT_TYPES_BY_EXTENSION[path.extname(musicPath).slice(1).toLowerCase()] ?? 'audio/unknown';
    if (manifest.musicTypes.includes(contentType)) return this.buildUploadFile({ filePath: musicPath, contentType });
    if (!manifest.musicTypes.includes(WAV_CONTENT_TYPE)) throw new Error(`${manifest.name} doesn’t take this kind of music file. Pick a file of one of these types: ${manifest.musicTypes.join(', ')}.`);
    const wavPath = path.join(jobFolder, `${path.parse(musicPath).name}.wav`);
    await writeFile(wavPath, await this.ports.convertToWav(musicBytes));
    return this.buildUploadFile({ filePath: wavPath, contentType: WAV_CONTENT_TYPE });
  }

  private async buildUploadFile({ filePath, contentType }: { filePath: string; contentType: string }): Promise<GeneratorUploadFile> {
    return { sourceId: this.ports.musicSources.register(filePath), fileName: path.basename(filePath), contentType, bytes: (await stat(filePath)).size };
  }

  private async waitUnlessStopped(seconds: number): Promise<void> {
    for (let waitedMilliseconds = 0; waitedMilliseconds < seconds * 1000 && !this.isSongSearchStopped; waitedMilliseconds += STOP_CHECK_EVERY_MILLISECONDS) {
      await this.ports.waitMilliseconds(STOP_CHECK_EVERY_MILLISECONDS);
    }
  }
}

function buildSongFacts({ choice, lengthSeconds }: { choice: MusicChoice; lengthSeconds: number }): GeneratorSongFacts {
  if (choice.kind === 'file') return { title: choice.title, artist: choice.artist, album: null, genre: null, lengthSeconds, youtubeId: null };
  const { title, artist, album, genre, youtubeId } = choice.song;
  return { title, artist, album, genre, lengthSeconds, youtubeId };
}

/** The extension from the link's file name or address, when it is one Sync knows; otherwise the fallback. */
function getLinkExtension({ link, knownExtensions, fallback }: { link: SongSourceFileLink; knownExtensions: ReadonlySet<string>; fallback: string }): string {
  const extension = path.extname(link.fileName ?? new URL(link.url).pathname).slice(1).toLowerCase();
  return knownExtensions.has(extension) ? extension : fallback;
}

function formatLength(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  return `${String(Math.floor(wholeSeconds / 60))}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}
