import { useState, type ReactElement } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { joinClassNames } from '../shared/class-names';
import { LifeBar } from '../shared/life-bar';
import { Note } from '../shared/small-parts';
import { StatusChip } from '../status/status-chip';
import type { AddonInstallPreview, AddonLookupResult, AddonView, MusicFolderScanState, MusicFolderView, PickedFileView, ServiceLookupRequest } from '../sync-ui-types';
import { AddAddonDialog } from './add-addon-dialog';
import { AddonCard } from './addon-card';

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');
const SCAN_STATE_DISPLAYS: Readonly<Record<MusicFolderScanState, { label: string; iconName: IconName; className: string }>> = {
  scanned: { label: 'Scanned', iconName: 'check', className: 'sv-sync-tone--synced' },
  scanning: { label: 'Scanning…', iconName: 'spin', className: 'sv-sync-tone--syncing' },
  waiting: { label: 'Waiting', iconName: 'none', className: 'sv-sync-tone--removed-from-vault' },
};

export interface MusicFolderScanView {
  scannedFileCount: number;
  percent: number;
}

export interface AudioSourcesScreenProps {
  musicFolders: readonly MusicFolderView[];
  scan: MusicFolderScanView | null;
  matchedSongCount: number;
  vaultSongCount: number;
  pickedFiles: readonly PickedFileView[];
  addons: readonly AddonView[];
  onAddMusicFolder: () => void;
  onRemoveMusicFolder: (folderPath: string) => void;
  onScanAgain: () => void;
  onGoToSongs: () => void;
  onToggleAddon: (request: { addonId: string; isEnabled: boolean }) => void;
  onRemoveAddon: (addonId: string) => void;
  onSetAddonOption: (request: { addonId: string; optionId: string; value: string }) => void;
  onLookUpAddon: (request: ServiceLookupRequest) => Promise<AddonLookupResult>;
  onInstallAddon: (addon: AddonInstallPreview) => void;
  /** Desktop only: offer a start command for an addon on this computer. */
  canUseStartCommand?: boolean;
}

/** Screen 4: where Sync looks for the player's own copy of each song. */
export function AudioSourcesScreen(props: AudioSourcesScreenProps): ReactElement {
  const [isAddingAddon, setIsAddingAddon] = useState(false);
  return (
    <div className="sv-sync-screen">
      <div className="sv-sync-stack-small">
        <h2 className="sv-sync-heading-1 sv-sync-heading-1--medium">Audio sources</h2>
        <p className="sv-sync-text">Every song needs your own copy of the music. Tell Sync where to look — StepsVault never sends anyone music.</p>
      </div>
      <div className="sv-sync-two-columns">
        <MusicFolderSource {...props} />
        <PickFileSource pickedFiles={props.pickedFiles} onGoToSongs={props.onGoToSongs} />
      </div>
      <section className="sv-sync-stack" aria-labelledby="sv-sync-addons-heading">
        <div className="sv-sync-row sv-sync-space-between sv-sync-wrap sv-sync-align-end">
          <div className="sv-sync-stack-tiny">
            <h2 id="sv-sync-addons-heading" className="sv-sync-heading-2">Addons</h2>
            <span className="sv-sync-text sv-sync-small">Links to other places your audio can come from, made by the community.</span>
          </div>
          <button className="sv-sync-button" type="button" onClick={() => { setIsAddingAddon(true); }}><Icon name="plus" strokeWidth={2.6} />Add addon</button>
        </div>
        <div className="sv-sync-addon-list">
          {props.addons.map((addon) => <AddonCard key={addon.addonId} addon={addon} onToggle={props.onToggleAddon} onRemove={props.onRemoveAddon} onSetOption={props.onSetAddonOption} />)}
          {props.addons.length === 0 && <p className="sv-sync-text sv-sync-small sv-sync-muted">No addons yet. Sync works without them.</p>}
        </div>
        <Note>Addons are made by other people, not StepsVault. Only install ones you trust. You can turn one off or remove it any time — songs keep the audio they already have.</Note>
      </section>
      {isAddingAddon && (
        <AddAddonDialog onLookUpAddon={props.onLookUpAddon} canUseStartCommand={props.canUseStartCommand} onInstall={(addon) => { setIsAddingAddon(false); props.onInstallAddon(addon); }} onClose={() => { setIsAddingAddon(false); }} />
      )}
    </div>
  );
}

function MusicFolderSource(props: AudioSourcesScreenProps): ReactElement {
  return (
    <section className="sv-sync-panel sv-sync-source-card" aria-labelledby="sv-sync-music-folder-heading">
      <SourceCardHead headingId="sv-sync-music-folder-heading" iconName="folder" title="My music folder" subtitle="Built in · used first" />
      <p className="sv-sync-text sv-sync-small">Pick one or more folders where you keep music. We match by name, then check the actual sound, so a different version won&apos;t be used by mistake.</p>
      <ul className="sv-sync-music-folders" aria-label="Music folders">
        {props.musicFolders.map((folder) => <MusicFolderRow key={folder.folderPath} folder={folder} onRemove={props.onRemoveMusicFolder} />)}
      </ul>
      {props.scan && (
        <div className="sv-sync-scan" aria-live="polite">
          <div className="sv-sync-row sv-sync-space-between sv-sync-small">
            <span>Scanning <b className="sv-sync-tabular sv-sync-strong">{NUMBER_FORMAT.format(props.scan.scannedFileCount)}</b> files…</span>
            <span className="sv-sync-tabular sv-sync-muted">{props.scan.percent}%</span>
          </div>
          <LifeBar label="Scanning music folder" value={props.scan.percent} maximum={100} />
          <span className="sv-sync-small sv-sync-muted">You can keep using Sync while we look.</span>
        </div>
      )}
      <div className="sv-sync-big-stat"><b className="sv-sync-tabular">{props.matchedSongCount}</b><span>of {props.vaultSongCount} vault songs found in your folders</span></div>
      <div className="sv-sync-row sv-sync-wrap">
        <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={props.onAddMusicFolder}><Icon name="plus" size={14} strokeWidth={2.6} />Add folder…</button>
        <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small" type="button" onClick={props.onScanAgain} disabled={props.scan !== null}><Icon name="spin" size={14} />Scan again</button>
      </div>
    </section>
  );
}

function MusicFolderRow({ folder, onRemove }: { folder: MusicFolderView; onRemove: (folderPath: string) => void }): ReactElement {
  const display = SCAN_STATE_DISPLAYS[folder.scanState];
  return (
    <li>
      <Icon name="folder" size={18} className="sv-sync-link-colour" />
      <span className="sv-sync-stack-tiny sv-sync-min-width-0">
        <span className="sv-sync-mono sv-sync-strong sv-sync-ellipsis">{folder.folderPath}</span>
        <span className="sv-sync-small sv-sync-subtle sv-sync-tabular">{folder.summaryText}</span>
      </span>
      <span className={joinClassNames('sv-sync-chip', display.className)}>
        <Icon name={display.iconName} size={14} strokeWidth={2.4} className={folder.scanState === 'scanning' ? 'sv-sync-spin' : undefined} />
        {display.label}
      </span>
      <button className="sv-sync-close-button" type="button" aria-label={`Remove ${folder.folderPath}`} onClick={() => { onRemove(folder.folderPath); }}>
        <Icon name="close" size={14} strokeWidth={2.6} />
      </button>
    </li>
  );
}

function PickFileSource({ pickedFiles, onGoToSongs }: { pickedFiles: readonly PickedFileView[]; onGoToSongs: () => void }): ReactElement {
  return (
    <section className="sv-sync-panel sv-sync-source-card" aria-labelledby="sv-sync-pick-file-heading">
      <SourceCardHead headingId="sv-sync-pick-file-heading" iconName="file" title="Pick a file" subtitle="Built in · for one song at a time" />
      <p className="sv-sync-text sv-sync-small">Got a song somewhere else? Use <b className="sv-sync-strong">Choose audio…</b> on its row or in its details. We still check it&apos;s the same version.</p>
      {pickedFiles.length > 0 && <span className="sv-sync-small sv-sync-muted">Picked files right now</span>}
      <ul className="sv-sync-picked-files">
        {pickedFiles.map((pickedFile) => (
          <li key={pickedFile.vaultSongId}>
            <span className="sv-sync-row" dir="auto"><span className="sv-sync-strong">{pickedFile.title}</span>{pickedFile.status !== 'synced' && <StatusChip status={pickedFile.status} isSmall />}</span>
            <span className="sv-sync-mono sv-sync-muted">{pickedFile.fileName}</span>
          </li>
        ))}
      </ul>
      <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small sv-sync-align-start" type="button" onClick={onGoToSongs}>Go to my songs</button>
    </section>
  );
}

function SourceCardHead({ headingId, iconName, title, subtitle }: { headingId: string; iconName: IconName; title: string; subtitle: string }): ReactElement {
  return (
    <div className="sv-sync-source-head">
      <span className="sv-sync-source-icon"><Icon name={iconName} size={22} /></span>
      <div className="sv-sync-grow">
        <h3 id={headingId} className="sv-sync-heading-2 sv-sync-heading-2--small">{title}</h3>
        <span className="sv-sync-small sv-sync-muted">{subtitle}</span>
      </div>
      <span className="sv-sync-badge sv-sync-badge--on">On</span>
    </div>
  );
}
