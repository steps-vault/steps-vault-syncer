import { useState, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import type { GeneratedSongView } from '../sync-ui-types';

export interface GeneratedSongListProps {
  songs: readonly GeneratedSongView[];
  /** The generator's own words on how it made the song (Markdown, shown as plain text); null when there are none. */
  onFetchSongReport: (songKey: string) => Promise<string | null>;
}

/** The songs in "My generated songs" in the game; each can show "How it was made". */
export function GeneratedSongList({ songs, onFetchSongReport }: GeneratedSongListProps): ReactElement | null {
  if (songs.length === 0) return null;
  return (
    <section className="sv-sync-stack" aria-labelledby="sv-sync-generated-songs-heading">
      <div className="sv-sync-stack-tiny">
        <h2 id="sv-sync-generated-songs-heading" className="sv-sync-heading-2">My generated songs</h2>
        <span className="sv-sync-text sv-sync-small">Songs you made with community generators. They are yours alone and stay on this computer.</span>
      </div>
      <ul className="sv-sync-generator-jobs">
        {songs.map((song) => <GeneratedSongRow key={song.songKey} song={song} onFetchSongReport={onFetchSongReport} />)}
      </ul>
    </section>
  );
}

type ReportState = { kind: 'closed' } | { kind: 'loading' } | { kind: 'shown'; text: string };

function GeneratedSongRow({ song, onFetchSongReport }: { song: GeneratedSongView; onFetchSongReport: (songKey: string) => Promise<string | null> }): ReactElement {
  const [report, setReport] = useState<ReportState>({ kind: 'closed' });
  const toggleReport = async (): Promise<void> => {
    if (report.kind !== 'closed') {
      setReport({ kind: 'closed' });
      return;
    }
    setReport({ kind: 'loading' });
    const text = await onFetchSongReport(song.songKey).catch(() => null);
    setReport({ kind: 'shown', text: text ?? 'Sync can’t find how this song was made any more.' });
  };
  return (
    <li className="sv-sync-generator-job" aria-label={song.title}>
      <div className="sv-sync-row sv-sync-space-between sv-sync-wrap">
        <span className="sv-sync-min-width-0">
          <b className="sv-sync-strong" dir="auto">{song.title}</b> <span className="sv-sync-muted" dir="auto">— {song.artist}</span>
          <span className="sv-sync-small sv-sync-subtle"> · {song.difficultiesText} · with {song.generatorName} · {song.madeAtText}</span>
        </span>
        {song.hasReport && (
          <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" aria-expanded={report.kind !== 'closed'} onClick={() => void toggleReport()}>
            <Icon name="info" size={14} />How it was made
          </button>
        )}
      </div>
      <span className="sv-sync-mono sv-sync-subtle sv-sync-break-all">{song.folderText}</span>
      {report.kind === 'loading' && <span className="sv-sync-small sv-sync-muted">Loading…</span>}
      {report.kind === 'shown' && <pre className="sv-sync-report" aria-label={`How ${song.title} was made`}>{report.text}</pre>}
    </li>
  );
}
