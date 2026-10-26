import type { ReactElement, ReactNode } from 'react';
import { Icon } from '../icons/icon';
import { APP_NAME } from '../shared/brand-names';
import { joinClassNames } from '../shared/class-names';
import type { ConnectedGameView, SyncPlatform, SyncScreen, TrayStatus } from '../sync-ui-types';
import { SyncNavigation } from './sync-navigation';

const TRAY_STATUS_LABELS: Readonly<Record<TrayStatus, string>> = { 'synced': 'Synced', 'syncing': 'Syncing…', 'needs-attention': 'Needs attention', 'paused': 'Paused' };

export interface DesktopSidebarView {
  game: ConnectedGameView | null;
  trayStatus: TrayStatus;
  playerName: string;
}

export interface SyncShellProps {
  platform: SyncPlatform;
  currentScreen: SyncScreen;
  onNavigate: (screen: SyncScreen) => void;
  hrefsByScreen?: Partial<Record<SyncScreen, string>>;
  /** Desktop only: the game, tray status and player at the bottom of the side menu. */
  desktopSidebar?: DesktopSidebarView;
  /** Desktop only: shown above every screen, for example the UpdateBanner. */
  banner?: ReactNode;
  /** Screens without the menu, such as the first-run "Connect your game". */
  isBare?: boolean;
  children: ReactNode;
}

/**
 * The Sync area of the website (under the site's own header) or the whole desktop window. The website and the app
 * show the same screens; only the frame around them differs.
 */
export function SyncShell(props: SyncShellProps): ReactElement {
  return (
    <div className={joinClassNames('sv-sync-root sv-sync-stage sv-sync-shell', `sv-sync-shell--${props.platform}`, props.isBare === true && 'sv-sync-shell--bare')}>
      {props.platform === 'desktop' && <h1 className="sv-sync-visually-hidden">{APP_NAME}</h1>}
      {props.platform === 'desktop' && props.banner}
      {props.platform === 'website' && <WebsiteSyncHeader />}
      <div className="sv-sync-shell-body">
        {props.isBare !== true && (
          <div className="sv-sync-sidebar">
            <SyncNavigation platform={props.platform} currentScreen={props.currentScreen} onNavigate={props.onNavigate} hrefsByScreen={props.hrefsByScreen} />
            {props.platform === 'desktop' && props.desktopSidebar && <DesktopSidebarFooter sidebar={props.desktopSidebar} />}
          </div>
        )}
        <main className="sv-sync-main">{props.children}</main>
      </div>
    </div>
  );
}

function WebsiteSyncHeader(): ReactElement {
  return (
    <div className="sv-sync-website-header">
      <div>
        <h1 className="sv-sync-display-title">Sync to my game</h1>
        <p className="sv-sync-lede">Your library&apos;s songs in your own StepMania, lined up with your music.</p>
      </div>
      <span className="sv-sync-website-hint">
        <Icon name="info" size={14} />
        Works in Chrome and Edge
      </span>
    </div>
  );
}

function DesktopSidebarFooter({ sidebar }: { sidebar: DesktopSidebarView }): ReactElement {
  return (
    <div className="sv-sync-sidebar-footer">
      {sidebar.game && (
        <div className="sv-sync-mini-card">
          <span className="sv-sync-row">
            <Icon name="gamepad" />
            <b>{sidebar.game.gameName}</b>
          </span>
          <span className="sv-sync-mono sv-sync-break-all">{sidebar.game.songsFolderPath}</span>
        </div>
      )}
      <div className={joinClassNames('sv-sync-mini-card sv-sync-mini-card--row', `sv-sync-tray-tone--${sidebar.trayStatus}`)}>
        <span className="sv-sync-status-dot" aria-hidden="true" />
        <span>
          Tray: <b>{TRAY_STATUS_LABELS[sidebar.trayStatus]}</b>
        </span>
      </div>
      <div className="sv-sync-signed-in">
        <span className="sv-sync-avatar" aria-hidden="true">{sidebar.playerName.slice(0, 1).toUpperCase()}</span>
        Signed in as <b>{sidebar.playerName}</b>
      </div>
    </div>
  );
}
