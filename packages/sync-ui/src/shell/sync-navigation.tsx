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
  /** Website only: show Generators, once the website can send music to a generator. */
  hasWebsiteGenerators?: boolean;
}

/** The website keeps the account in its own settings, and shows Generators only when it can make songs. */
export function getNavigationItems({ platform, hasWebsiteGenerators = false }: { platform: SyncPlatform; hasWebsiteGenerators?: boolean }): readonly NavigationItem[] {
  if (platform === 'desktop') return NAVIGATION_ITEMS;
  return NAVIGATION_ITEMS.filter((item) => item.screen !== 'account' && (item.screen !== 'generators' || hasWebsiteGenerators));
}

export function SyncNavigation({ platform, currentScreen, onNavigate, hrefsByScreen, hasWebsiteGenerators }: SyncNavigationProps): ReactElement {
  const handleClick = ({ event, screen }: { event: MouseEvent<HTMLAnchorElement>; screen: SyncScreen }): void => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    onNavigate(screen);
  };
  return (
    <nav className="sv-sync-navigation" aria-label="Sync">
      {getNavigationItems({ platform, hasWebsiteGenerators }).map((item) => (
        <a key={item.screen} href={hrefsByScreen?.[item.screen] ?? `#${item.screen}`} aria-current={item.screen === currentScreen ? 'page' : undefined} onClick={(event) => { handleClick({ event, screen: item.screen }); }}>
          <Icon name={item.iconName} size={18} />
          {item.label}
        </a>
      ))}
    </nav>
  );
}
