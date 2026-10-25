import type { MouseEvent, ReactElement } from 'react';
import { Icon, type IconName } from '../icons/icon';
import type { SyncPlatform, SyncScreen } from '../sync-ui-types';

interface NavigationItem {
  screen: SyncScreen;
  label: string;
  iconName: IconName;
}

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { screen: 'songs', label: 'Songs', iconName: 'note' },
  { screen: 'audio-sources', label: 'Audio sources', iconName: 'bars' },
  { screen: 'generators', label: 'Generators', iconName: 'sparkle' },
  { screen: 'folder-layout', label: 'Folder layout', iconName: 'layout' },
  { screen: 'activity', label: 'Activity', iconName: 'clock' },
  { screen: 'account', label: 'Account', iconName: 'person' },
];

export interface SyncNavigationProps {
  platform: SyncPlatform;
  currentScreen: SyncScreen;
  onNavigate: (screen: SyncScreen) => void;
  /** Real addresses for the website's router; without them the links only call onNavigate. */
  hrefsByScreen?: Partial<Record<SyncScreen, string>>;
}

// The website keeps the account in its own settings, and has no way yet to send music to a generator.
const DESKTOP_ONLY_SCREENS: readonly SyncScreen[] = ['account', 'generators'];

/** Only the desktop app shows "Account" and "Generators" here. */
export function getNavigationItems(platform: SyncPlatform): readonly NavigationItem[] {
  return platform === 'desktop' ? NAVIGATION_ITEMS : NAVIGATION_ITEMS.filter((item) => !DESKTOP_ONLY_SCREENS.includes(item.screen));
}

export function SyncNavigation({ platform, currentScreen, onNavigate, hrefsByScreen }: SyncNavigationProps): ReactElement {
  const handleClick = ({ event, screen }: { event: MouseEvent<HTMLAnchorElement>; screen: SyncScreen }): void => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(screen);
  };
  return (
    <nav className="sv-sync-navigation" aria-label="Sync">
      {getNavigationItems(platform).map((item) => (
        <a key={item.screen} href={hrefsByScreen?.[item.screen] ?? `#${item.screen}`} aria-current={item.screen === currentScreen ? 'page' : undefined} onClick={(event) => { handleClick({ event, screen: item.screen }); }}>
          <Icon name={item.iconName} size={18} />
          {item.label}
        </a>
      ))}
    </nav>
  );
}
