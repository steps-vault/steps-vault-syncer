import { Fragment, useState, type ReactElement } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { SegmentedControl, type SegmentedOption } from '../shared/small-parts';
import type { ActivityEntryView, ActivityKind } from '../sync-ui-types';

export type ActivityFilter = 'everything' | 'added' | 'updated' | 'skipped' | 'removed';

const ACTIVITY_FILTER_OPTIONS: readonly SegmentedOption<ActivityFilter>[] = [
  { value: 'everything', label: 'Everything' },
  { value: 'added', label: 'Added' },
  { value: 'updated', label: 'Updated' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'removed', label: 'Removed' },
];

interface ActivityKindDisplay {
  iconName: IconName;
  toneClassName: string;
  filter: ActivityFilter;
}

const ACTIVITY_KIND_DISPLAYS: Readonly<Record<ActivityKind, ActivityKindDisplay>> = {
  'sync-finished': { iconName: 'check', toneClassName: 'sv-sync-tone--syncing', filter: 'everything' },
  'added': { iconName: 'plus', toneClassName: 'sv-sync-tone--synced', filter: 'added' },
  'lined-up': { iconName: 'plus', toneClassName: 'sv-sync-tone--synced', filter: 'added' },
  'updated': { iconName: 'up', toneClassName: 'sv-sync-tone--update-available', filter: 'updated' },
  'no-audio': { iconName: 'note', toneClassName: 'sv-sync-tone--needs-audio', filter: 'skipped' },
  'different-edit': { iconName: 'wave', toneClassName: 'sv-sync-tone--different-edit', filter: 'skipped' },
  'kept-edits': { iconName: 'pencil', toneClassName: 'sv-sync-tone--you-edited-this', filter: 'skipped' },
  'addon-not-answering': { iconName: 'plug', toneClassName: 'sv-sync-tone--needs-audio', filter: 'skipped' },
  'removed': { iconName: 'archive', toneClassName: 'sv-sync-tone--removed-from-vault', filter: 'removed' },
  'moved': { iconName: 'folder', toneClassName: 'sv-sync-tone--update-available', filter: 'everything' },
  'connected': { iconName: 'check', toneClassName: 'sv-sync-tone--syncing', filter: 'everything' },
  'write-failed': { iconName: 'warning', toneClassName: 'sv-sync-tone--different-edit', filter: 'skipped' },
  'generating': { iconName: 'spin', toneClassName: 'sv-sync-tone--syncing', filter: 'everything' },
  'generated': { iconName: 'plus', toneClassName: 'sv-sync-tone--synced', filter: 'added' },
  'generate-failed': { iconName: 'warning', toneClassName: 'sv-sync-tone--different-edit', filter: 'skipped' },
  'generate-cancelled': { iconName: 'none', toneClassName: 'sv-sync-tone--removed-from-vault', filter: 'skipped' },
};

export function getVisibleActivityEntries({ entries, filter }: { entries: readonly ActivityEntryView[]; filter: ActivityFilter }): ActivityEntryView[] {
  if (filter === 'everything') return [...entries];
  return entries.filter((entry) => ACTIVITY_KIND_DISPLAYS[entry.kind].filter === filter);
}

export interface ActivityScreenProps {
  /** Newest first. */
  entries: readonly ActivityEntryView[];
  onCopyDetails: () => void;
  /** Set after Copy details worked, to say so. */
  wasCopied: boolean;
  hasOlderEntries: boolean;
  onShowOlder: () => void;
}

/** Screen 6: what Sync did, newest first; each entry opens to its details, and support can get a copy. */
export function ActivityScreen(props: ActivityScreenProps): ReactElement {
  const [filter, setFilter] = useState<ActivityFilter>('everything');
  const [openEntryIds, setOpenEntryIds] = useState<ReadonlySet<string>>(new Set());
  const toggleEntry = (entryId: string): void => {
    setOpenEntryIds((current) => {
      const next = new Set(current);
      if (!next.delete(entryId)) next.add(entryId);
      return next;
    });
  };
  const visibleEntries = getVisibleActivityEntries({ entries: props.entries, filter });
  return (
    <div className="sv-sync-screen">
      <div className="sv-sync-row sv-sync-wrap sv-sync-space-between sv-sync-align-end">
        <div className="sv-sync-stack-small">
          <h2 className="sv-sync-heading-1 sv-sync-heading-1--medium">Activity</h2>
          <p className="sv-sync-text">Everything Sync did, newest first. Open an entry to see the details.</p>
        </div>
        <div className="sv-sync-row sv-sync-wrap">
          {props.wasCopied && <span className="sv-sync-copied" role="status"><Icon name="check" size={14} strokeWidth={3} />Copied — paste it into your message to support</span>}
          <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onCopyDetails}><Icon name="copy" />Copy details</button>
        </div>
      </div>
      <div className="sv-sync-row sv-sync-wrap">
        <span className="sv-sync-label sv-sync-label--plain">Show</span>
        <SegmentedControl label="Show" options={ACTIVITY_FILTER_OPTIONS} selectedValue={filter} onSelect={setFilter} />
      </div>
      <ol className="sv-sync-timeline" aria-label="Sync activity">
        {visibleEntries.map((entry, index) => (
          <Fragment key={entry.entryId}>
            {entry.dayText !== visibleEntries[index - 1]?.dayText && <li className="sv-sync-timeline-day" aria-hidden="true">{entry.dayText}</li>}
            <ActivityEntry entry={entry} isOpen={openEntryIds.has(entry.entryId)} onToggle={() => { toggleEntry(entry.entryId); }} />
          </Fragment>
        ))}
      </ol>
      {visibleEntries.length === 0 && <p className="sv-sync-text sv-sync-muted" role="status">Nothing here yet.</p>}
      {props.hasOlderEntries && <div className="sv-sync-center-row"><button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={props.onShowOlder}>Show older activity</button></div>}
    </div>
  );
}

function ActivityEntry({ entry, isOpen, onToggle }: { entry: ActivityEntryView; isOpen: boolean; onToggle: () => void }): ReactElement {
  const display = ACTIVITY_KIND_DISPLAYS[entry.kind];
  const detailsId = `sv-sync-activity-${entry.entryId}`;
  return (
    <li className={joinClassNames('sv-sync-timeline-entry', isOpen && 'sv-sync-timeline-entry--open')}>
      <button className="sv-sync-timeline-head" type="button" aria-expanded={isOpen} aria-controls={detailsId} onClick={onToggle}>
        <span className={joinClassNames('sv-sync-timeline-icon', display.toneClassName)}><Icon name={display.iconName} size={18} strokeWidth={2.4} /></span>
        <span className="sv-sync-min-width-0">
          <span className="sv-sync-timeline-text" dir="auto">{entry.textBefore}<b dir="auto">{entry.highlightedText}</b>{entry.textAfter}</span>
          <span className="sv-sync-timeline-summary">{entry.summaryText}</span>
        </span>
        <span className="sv-sync-timeline-time"><span className="sv-sync-visually-hidden">{entry.dayText}, </span>{entry.timeText}</span>
        <Icon name="chevron" size={16} strokeWidth={2.4} className="sv-sync-timeline-caret" />
      </button>
      {isOpen && (
        <div id={detailsId} className="sv-sync-timeline-details">
          <dl className="sv-sync-facts sv-sync-facts--boxed">
            {entry.details.map((detail) => (
              <Fragment key={detail.label}>
                <dt>{detail.label}</dt>
                <dd dir="auto">{detail.value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}
