import { useState, type ReactElement } from 'react';
import { DifficultyLevelBadges } from '../shared/difficulty-levels';
import { EmptyBox } from '../shared/miss-line';
import { ReceptorLoader } from '../shared/receptor-loader';
import type { GeneratedSongView } from '../sync-ui-types';

export interface GeneratedSongListProps {
  songs: readonly GeneratedSongView[];
  /** The generator's own words on how it made the song (Markdown, shown as plain text); null when there are none. */
  onFetchSongReport: (songKey: string) => Promise<string | null>;
  /** Offered on the empty list; without it the empty list says nothing. */
  onMakeSong?: () => void;
}

/** The songs in "My generated songs" in the game; each can show "How it was made". */
export function GeneratedSongList({ songs, onFetchSongReport, onMakeSong }: GeneratedSongListProps): ReactElement | null {
  if (songs.length === 0 && !onMakeSong) return null;
  return (
    <section className="sv-sync-stack" aria-labelledby="sv-sync-generated-songs-heading">
      <div className="sv-sync-stack-tiny">
        <h2 id="sv-sync-generated-songs-heading" className="sv-sync-heading-2">My generated songs</h2>
        <span className="sv-sync-text sv-sync-small">Made with community generators. Yours alone, on this computer.</span>
      </div>
      {songs.length === 0 && onMakeSong && (
        <EmptyBox action={<button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={onMakeSong}>Make a song</button>}>No generated songs yet.</EmptyBox>
      )}
      {songs.length > 0 && (
        <ul className="sv-sync-generator-jobs">
          {songs.map((song) => <GeneratedSongRow key={song.songKey} song={song} onFetchSongReport={onFetchSongReport} />)}
        </ul>
      )}
    </section>
  );
}

type ReportState = { kind: 'closed' } | { kind: 'loading' } | { kind: 'shown'; text: string } | { kind: 'missing' };

function GeneratedSongRow({ song, onFetchSongReport }: { song: GeneratedSongView; onFetchSongReport: (songKey: string) => Promise<string | null> }): ReactElement {
  const [report, setReport] = useState<ReportState>({ kind: 'closed' });
  const toggleReport = async (): Promise<void> => {
    if (report.kind !== 'closed') {
      setReport({ kind: 'closed' });
      return;
    }
    setReport({ kind: 'loading' });
    const text = await onFetchSongReport(song.songKey).catch(() => null);
    setReport(text === null ? { kind: 'missing' } : { kind: 'shown', text });
  };
  return (
    <li className="sv-sync-generator-job sv-sync-generated-song" aria-label={song.title}>
      <div className="sv-sync-generated-song-top">
        <span className="sv-sync-stack-tiny sv-sync-min-width-0">
          <b className="sv-sync-strong" dir="auto">{song.title}</b>
          <span className="sv-sync-small sv-sync-muted" dir="auto">{song.artist}</span>
        </span>
        {song.levels ? <DifficultyLevelBadges levels={song.levels} /> : <span className="sv-sync-small sv-sync-muted">{song.difficultiesText}</span>}
        <span className="sv-sync-small sv-sync-subtle">{song.generatorName} · {song.madeAtText}</span>
        {song.hasReport && (
          <button className="sv-sync-link-button" type="button" aria-expanded={report.kind !== 'closed'} onClick={() => void toggleReport()}>How it was made</button>
        )}
      </div>
      <span className="sv-sync-mono sv-sync-subtle sv-sync-break-all" dir="auto">{song.folderText}</span>
      {report.kind !== 'closed' && (
        <div className="sv-sync-report" aria-label={`How ${song.title} was made`}>
          {report.kind === 'loading' && <ReceptorLoader label="Loading…" isSmall />}
          {report.kind === 'shown' && <span className="sv-sync-report-text">{report.text}</span>}
          {report.kind === 'missing' && <span className="sv-sync-muted">We can&apos;t find the report for this song.</span>}
        </div>
      )}
    </li>
  );
}
