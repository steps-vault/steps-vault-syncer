import { describe, expect, it } from 'vitest';
import { GeneratorError } from '../generators/generator-error';
import type { GeneratedSongFiles } from '../generators/generator-files';
import type { GeneratorSongFacts } from '../generators/generator-protocol';
import type { VaultSongIdentity } from '../generators/generated-song-identity';
import type { PlainPictureRequest } from '../generators/song-pictures';
import { getGeneratedSongs } from '../ownership/generated-songs';
import { buildEmptyInstalledSongsRecord, type InstalledSongsRecord } from '../ownership/installed-songs';
import { SONG_FOLDER_MARKER_FILE_NAME } from '../ownership/song-folder-marker';
import { MemorySongsFolder } from '../songs-folder/memory-songs-folder';
import { writeGeneratedSong, type GeneratedSongRequest, type GeneratedSongWriteResult, type VaultSongChoice } from './generated-song-writer';
import { SongWriteError } from './song-write-error';

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const PLAIN_PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2]);
const GENERATOR_MUSIC_BYTES = new Uint8Array([79, 103, 103, 83, 1]);
const PLAYER_MUSIC_BYTES = new Uint8Array([79, 103, 103, 83, 2]);
const VIDEO_BYTES = new Uint8Array([0, 0, 0, 24]);
const GROUP = 'My generated songs';
const PULSE_GARDEN: GeneratorSongFacts = { title: 'Pulse Garden', artist: 'Kairo Lights', album: null, genre: null, lengthSeconds: 201, youtubeId: 'pulse123' };

function buildChart({ stepsType = 'dance-single', difficulty }: { stepsType?: string; difficulty: string }): string {
  return ['#NOTEDATA:;', `#STEPSTYPE:${stepsType};`, `#DIFFICULTY:${difficulty};`, '#NOTES:', '1000', '0100', ';', ''].join('\n');
}

function buildSongSsc({ header = {}, charts = ['Easy', 'Medium'] }: { header?: Record<string, string | null>; charts?: string[] } = {}): string {
  const tags: Record<string, string | null> = { TITLE: 'Pulse Garden', ARTIST: 'Kairo Lights', MUSIC: 'generator-song.ogg', BANNER: 'bn.png', CDTITLE: 'cd.png', OFFSET: '-0.100', BPMS: '0.000=120.000', BGCHANGES: '0=theirs.mp4=1=0=0=1', ...header };
  const headerLines = Object.entries(tags).flatMap(([tagName, value]) => (value === null ? [] : [`#${tagName}:${value};`]));
  return [...headerLines, '', ...charts.map((difficulty) => buildChart({ difficulty }))].join('\n');
}

class GeneratedSongGame {
  readonly songsFolder = new MemorySongsFolder();
  readonly picturesBySourceId = new Map<string, Uint8Array>();
  readonly plainPictureRequests: PlainPictureRequest[] = [];
  record: InstalledSongsRecord = buildEmptyInstalledSongsRecord();
  canMakePictures = false;
  private idCount = 0;

  constructor() {
    this.songsFolder.addMusicSource({ sourceId: 'download:music', bytes: GENERATOR_MUSIC_BYTES });
    this.songsFolder.addMusicSource({ sourceId: 'file:player-music', bytes: PLAYER_MUSIC_BYTES });
    this.songsFolder.addMusicSource({ sourceId: 'download:video', bytes: VIDEO_BYTES });
    this.picturesBySourceId.set('download:banner', PNG_BYTES);
    this.picturesBySourceId.set('download:background', PNG_BYTES);
    this.picturesBySourceId.set('download:jacket', PNG_BYTES);
  }

  async write({ files = {}, song = PULSE_GARDEN, difficulties = ['Easy', 'Medium'], vaultSongs = [], vaultSongChoice = null }: { files?: Partial<GeneratedSongFiles>; song?: GeneratorSongFacts; difficulties?: GeneratedSongRequest['difficulties']; vaultSongs?: VaultSongIdentity[]; vaultSongChoice?: VaultSongChoice | null } = {}): Promise<GeneratedSongWriteResult> {
    const request: GeneratedSongRequest = {
      generator: { id: 'example.onset-steps', name: 'Onset Steps', version: '0.1.0' },
      song,
      difficulties,
      files: { chartText: buildSongSsc(), reportText: null, sourceIdByKind: { music: 'download:music', video: 'download:video', banner: 'download:banner', background: 'download:background', jacket: 'download:jacket' }, ...files },
      playerMusicSourceId: 'file:player-music',
      playerVideoSourceId: null,
    };
    const result = await writeGeneratedSong({ dependencies: this.dependencies, record: this.record, request, vaultSongs, vaultSongChoice });
    if (result.kind !== 'needs-vault-choice') this.record = result.record;
    return result;
  }

  readSongText(folderName: string): Promise<string | null> {
    return this.songsFolder.readText([GROUP, folderName, `${folderName}.ssc`]);
  }

  private get dependencies() {
    return {
      songsFolder: this.songsFolder,
      readDownloadedPicture: (sourceId: string) => Promise.resolve(this.picturesBySourceId.get(sourceId) ?? new Uint8Array()),
      pictureMaker: this.canMakePictures ? { makePlainPicture: (request: PlainPictureRequest) => Promise.resolve(void this.plainPictureRequests.push(request)).then(() => PLAIN_PNG_BYTES) } : null,
      createId: () => `id-${String((this.idCount += 1))}`,
      getNow: () => '2026-10-25T12:00:00Z',
    };
  }
}

async function getRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => { throw new Error('Expected the promise to be rejected.'); }, (error: unknown) => error);
}

describe('writeGeneratedSong', () => {
  it('writes a good song into My generated songs under Sync’s own names and records it as generated', async () => {
    const game = new GeneratedSongGame();
    const result = await game.write();
    const folder = [GROUP, 'Pulse Garden'];
    const songText = await game.readSongText('Pulse Garden');
    expect(result).toMatchObject({ kind: 'written', wasReplaced: false });
    expect(songText).toContain('#MUSIC:music.ogg;');
    expect(songText).toContain('#BANNER:banner.png;');
    expect(songText).toContain('#BACKGROUND:background.png;');
    expect(songText).toContain('#JACKET:jacket.png;');
    expect(songText).toContain('#CDTITLE:;');
    expect(songText).toContain('#BPMS:0.000=120.000;\n#BGCHANGES:-0.200=video.mp4=1.000=0=0=1=====,\n99999=-nosongbg-=1.000=0=0=0;\n');
    expect(songText).not.toContain('theirs.mp4');
    expect(game.songsFolder.readBytes([...folder, 'music.ogg'])).toEqual(GENERATOR_MUSIC_BYTES);
    expect(game.songsFolder.readBytes([...folder, 'video.mp4'])).toEqual(VIDEO_BYTES);
    expect(game.songsFolder.readBytes([...folder, 'banner.png'])).toEqual(PNG_BYTES);
    expect(await game.songsFolder.readText([...folder, SONG_FOLDER_MARKER_FILE_NAME])).toContain('"format": "stepsvault-generated-song"');
    expect(getGeneratedSongs(game.record)).toMatchObject([{ songKey: 'youtube:pulse123', generatorId: 'example.onset-steps', generatorVersion: '0.1.0', folderPath: folder, difficulties: ['Easy', 'Medium'], inPlaceOfVaultSongId: null }]);
    expect(game.record.ownedGroupNames).toEqual([GROUP]);
    expect((await game.songsFolder.listEntries([GROUP])).map((entry) => entry.name)).toEqual(['Pulse Garden']);
  });

  it('refuses a song file without #OFFSET and writes nothing', async () => {
    const game = new GeneratedSongGame();
    const error = await getRejection(game.write({ files: { chartText: buildSongSsc({ header: { OFFSET: null } }) } }));
    expect(error).toBeInstanceOf(GeneratorError);
    expect(error).toMatchObject({ reason: 'missing-offset', message: expect.stringContaining('has no #OFFSET') as unknown });
    expect(await game.songsFolder.listEntries([])).toEqual([]);
  });

  it('refuses a song file without a usable #BPMS', async () => {
    const game = new GeneratedSongGame();
    expect(await getRejection(game.write({ files: { chartText: buildSongSsc({ header: { BPMS: '0.000=0' } }) } }))).toMatchObject({ reason: 'missing-tempo' });
  });

  it('refuses a song without a dance-single chart for every difficulty asked, naming the missing ones', async () => {
    const game = new GeneratedSongGame();
    const chartText = [buildSongSsc({ charts: ['Easy'] }), buildChart({ stepsType: 'dance-double', difficulty: 'Medium' })].join('');
    const error = await getRejection(game.write({ files: { chartText }, difficulties: ['Beginner', 'Easy', 'Medium'] }));
    expect(error).toMatchObject({ reason: 'missing-difficulty', message: 'Onset Steps didn’t make the Beginner and Medium dance-single charts you asked for, so Sync refused the song; make it again or ask its maker why.' });
    expect(await game.songsFolder.listEntries([])).toEqual([]);
  });

  it('drops charts that weren’t asked for: other difficulties, other steps types and second copies', async () => {
    const game = new GeneratedSongGame();
    const chartText = [buildSongSsc({ charts: ['Easy', 'Medium', 'Hard', 'Medium', 'Challenge'] }), buildChart({ stepsType: 'dance-double', difficulty: 'Easy' })].join('');
    await game.write({ files: { chartText }, difficulties: ['Easy', 'Medium'] });
    const songText = (await game.readSongText('Pulse Garden')) ?? '';
    expect(songText.match(/^#DIFFICULTY:.*$/gm)).toEqual(['#DIFFICULTY:Easy;', '#DIFFICULTY:Medium;']);
    expect(songText).not.toContain('dance-double');
  });

  it('leaves missing pictures out of the song file when the platform can’t draw, and never keeps a file that isn’t a PNG', async () => {
    const game = new GeneratedSongGame();
    game.picturesBySourceId.set('download:banner', new Uint8Array([60, 115, 99, 114, 105, 112, 116, 62]));
    await game.write({ files: { sourceIdByKind: { music: 'download:music' } } });
    const songText = await game.readSongText('Pulse Garden');
    expect(songText).toContain('#BANNER:;');
    expect(songText).toContain('#BACKGROUND:;');
    expect(songText).toContain('#JACKET:;');
    expect((await game.songsFolder.listEntries([GROUP, 'Pulse Garden'])).map((entry) => entry.name).sort()).toEqual([SONG_FOLDER_MARKER_FILE_NAME, 'Pulse Garden.ssc', 'music.ogg']);
  });

  it('makes plain pictures, at the sizes generators.md gives, for the pictures the generator didn’t send', async () => {
    const game = new GeneratedSongGame();
    game.canMakePictures = true;
    game.picturesBySourceId.set('download:banner', new Uint8Array([71, 73, 70, 56, 57, 97]));
    await game.write({ files: { sourceIdByKind: { music: 'download:music', jacket: 'download:jacket' } } });
    expect(game.plainPictureRequests).toEqual([
      { kind: 'banner', width: 418, height: 164, title: 'Pulse Garden', artist: 'Kairo Lights' },
      { kind: 'background', width: 854, height: 480, title: 'Pulse Garden', artist: 'Kairo Lights' },
    ]);
    expect(game.songsFolder.readBytes([GROUP, 'Pulse Garden', 'banner.png'])).toEqual(PLAIN_PNG_BYTES);
    expect(game.songsFolder.readBytes([GROUP, 'Pulse Garden', 'jacket.png'])).toEqual(PNG_BYTES);
    expect(await game.readSongText('Pulse Garden')).toContain('#BANNER:banner.png;');
  });

  it('uses the player’s own music when the generator sent none', async () => {
    const game = new GeneratedSongGame();
    await game.write({ files: { sourceIdByKind: {} } });
    expect(game.songsFolder.readBytes([GROUP, 'Pulse Garden', 'music.ogg'])).toEqual(PLAYER_MUSIC_BYTES);
    expect(await game.readSongText('Pulse Garden')).toContain('#MUSIC:music.ogg;');
    expect(await game.readSongText('Pulse Garden')).not.toContain('#BGCHANGES');
  });

  it('names the folder in English letters from #TITLETRANSLIT', async () => {
    const game = new GeneratedSongGame();
    const song = { ...PULSE_GARDEN, title: 'הזוג הזה', artist: 'מרגי', youtubeId: null };
    await game.write({ song, files: { chartText: buildSongSsc({ header: { TITLE: 'הזוג הזה', TITLETRANSLIT: 'HaZug HaZe', ARTIST: 'מרגי' } }) } });
    expect(await game.songsFolder.listEntries([GROUP])).toEqual([{ name: 'HaZug HaZe', isFolder: true }]);
    expect(await game.readSongText('HaZug HaZe')).toContain('#TITLE:הזוג הזה;');
    expect(getGeneratedSongs(game.record)[0]?.songKey).toBe('song:הזוג הזה\nמרגי');
  });

  it('falls back to “Song <youtubeId>” when the title has no English spelling', async () => {
    const game = new GeneratedSongGame();
    await game.write({ files: { chartText: buildSongSsc({ header: { TITLE: 'הזוג הזה', ARTIST: 'מרגי' } }) } });
    expect(await game.songsFolder.listEntries([GROUP])).toEqual([{ name: 'Song pulse123', isFolder: true }]);
    expect(await game.readSongText('Song pulse123')).toContain('#TITLE:הזוג הזה;');
  });

  it('falls back to “Generated song <date> <time>” without a youtubeId, and never keeps a title with other scripts left in it', async () => {
    const game = new GeneratedSongGame();
    const song = { ...PULSE_GARDEN, youtubeId: null };
    await game.write({ song, files: { chartText: buildSongSsc({ header: { TITLE: 'Tokyo 東京' } }) } });
    await game.write({ song: { ...song, title: 'Other' }, files: { chartText: buildSongSsc({ header: { TITLE: 'Другая' } }) } });
    expect((await game.songsFolder.listEntries([GROUP])).map((entry) => entry.name).sort()).toEqual(['Generated song 2026-10-25 1200', 'Generated song 2026-10-25 1200 (Kairo Lights)']);
  });

  it('folds accents rather than falling back', async () => {
    const game = new GeneratedSongGame();
    await game.write({ files: { chartText: buildSongSsc({ header: { TITLE: 'Café Beyoncé' } }) } });
    expect(await game.songsFolder.listEntries([GROUP])).toEqual([{ name: 'Cafe Beyonce', isFolder: true }]);
  });

  it('replaces the earlier version of the same song in the same folder, removing the files it no longer uses', async () => {
    const game = new GeneratedSongGame();
    await game.write();
    const result = await game.write({ files: { chartText: buildSongSsc({ charts: ['Hard'] }), sourceIdByKind: { music: 'download:music' } }, difficulties: ['Hard'] });
    const folder = [GROUP, 'Pulse Garden'];
    expect(result).toMatchObject({ kind: 'written', wasReplaced: true });
    expect((await game.readSongText('Pulse Garden'))?.match(/^#DIFFICULTY:.*$/gm)).toEqual(['#DIFFICULTY:Hard;']);
    expect(game.songsFolder.readBytes([...folder, 'video.mp4'])).toBeNull();
    expect(game.songsFolder.readBytes([...folder, 'banner.png'])).toBeNull();
    expect((await game.songsFolder.listEntries([GROUP])).map((entry) => entry.name)).toEqual(['Pulse Garden']);
    expect(getGeneratedSongs(game.record)).toMatchObject([{ installId: 'id-2', difficulties: ['Hard'], folderPath: folder }]);
  });

  it('never replaces a folder the player put in place of the earlier version', async () => {
    const game = new GeneratedSongGame();
    await game.write();
    await game.songsFolder.removeFolder([GROUP, 'Pulse Garden']);
    await game.songsFolder.writeText({ path: [GROUP, 'Pulse Garden', 'mine.ssc'], text: 'the player’s own song' });
    await game.write();
    expect(await game.songsFolder.readText([GROUP, 'Pulse Garden', 'mine.ssc'])).toBe('the player’s own song');
    expect(getGeneratedSongs(game.record)).toMatchObject([{ folderPath: [GROUP, 'Pulse Garden (Kairo Lights)'] }]);
  });

  it('keeps the old version and leaves no hidden folder when the new one can’t be written', async () => {
    const game = new GeneratedSongGame();
    await game.write();
    game.songsFolder.failWritesAfter({ count: 2, failure: 'disk-full' });
    const error = await getRejection(game.write());
    expect(error).toBeInstanceOf(SongWriteError);
    expect(error).toMatchObject({ failure: 'disk-full' });
    expect((await game.songsFolder.listEntries([GROUP])).map((entry) => entry.name)).toEqual(['Pulse Garden']);
    expect(game.songsFolder.readBytes([GROUP, 'Pulse Garden', 'video.mp4'])).toEqual(VIDEO_BYTES);
  });
});

describe('a generated song that is also in the vault', () => {
  const VAULT_SONGS: VaultSongIdentity[] = [{ vaultSongId: 'vault-1', title: 'Another Title', artist: 'Someone', youtubeId: 'pulse123' }];

  it('asks the player which one to keep, and writes nothing yet', async () => {
    const game = new GeneratedSongGame();
    const result = await game.write({ vaultSongs: VAULT_SONGS });
    expect(result).toEqual({ kind: 'needs-vault-choice', vaultSongId: 'vault-1', question: '“Another Title” is also in your vault. Which one do you want in your game: the vault song or the one you made?' });
    expect(await game.songsFolder.listEntries([])).toEqual([]);
  });

  it('finds the same song by title and artist when there is no video', async () => {
    const game = new GeneratedSongGame();
    const result = await game.write({ song: { ...PULSE_GARDEN, youtubeId: null }, vaultSongs: [{ vaultSongId: 'vault-2', title: ' pulse  GARDEN', artist: 'Kairo Lights', youtubeId: null }] });
    expect(result).toMatchObject({ kind: 'needs-vault-choice', vaultSongId: 'vault-2' });
  });

  it('writes nothing when the player keeps the vault song', async () => {
    const game = new GeneratedSongGame();
    const result = await game.write({ vaultSongs: VAULT_SONGS, vaultSongChoice: 'keep-vault-song' });
    expect(result.kind).toBe('kept-vault-song');
    expect(await game.songsFolder.listEntries([])).toEqual([]);
    expect(getGeneratedSongs(game.record)).toEqual([]);
  });

  it('writes the generated song, noting the vault song it stands in for, when the player keeps it', async () => {
    const game = new GeneratedSongGame();
    const result = await game.write({ vaultSongs: VAULT_SONGS, vaultSongChoice: 'keep-generated-song' });
    expect(result.kind).toBe('written');
    expect(await game.readSongText('Pulse Garden')).toContain('#MUSIC:music.ogg;');
    expect(getGeneratedSongs(game.record)).toMatchObject([{ inPlaceOfVaultSongId: 'vault-1' }]);
  });

  it('still refuses a broken song file before asking anything', async () => {
    const game = new GeneratedSongGame();
    expect(await getRejection(game.write({ vaultSongs: VAULT_SONGS, files: { chartText: buildSongSsc({ header: { OFFSET: null } }) } }))).toMatchObject({ reason: 'missing-offset' });
  });
});
