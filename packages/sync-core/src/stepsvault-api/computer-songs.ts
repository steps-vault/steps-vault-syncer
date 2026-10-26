import type { GeneratedSong } from '../ownership/generated-songs';

/** The site takes at most this many songs in one report (domain MAX_COMPUTER_SONGS_PER_REPORT). */
export const MAX_COMPUTER_SONGS_PER_REPORT = 500;

/** One song a community generator made on this computer, as the site's My songs "This PC" tab lists it. */
export interface ComputerSongReport {
  /** The song's key on this computer; the same song made again keeps it. */
  localId: string;
  title: string;
  artistName: string;
  generatorName: string;
  difficulties: string[];
  /** ISO time the song was made. */
  madeAt: string;
}

/** The full list for POST /api/computer-songs, newest first, cut to what the site takes; it replaces the last report. */
export function buildComputerSongReports(generatedSongs: readonly GeneratedSong[]): ComputerSongReport[] {
  return [...generatedSongs]
    .sort((first, second) => second.generatedAt.localeCompare(first.generatedAt))
    .slice(0, MAX_COMPUTER_SONGS_PER_REPORT)
    .map((generatedSong) => ({
      localId: generatedSong.songKey,
      title: generatedSong.song.title,
      artistName: generatedSong.song.artist,
      generatorName: generatedSong.generatorName,
      difficulties: [...generatedSong.difficulties],
      madeAt: generatedSong.generatedAt,
    }));
}
