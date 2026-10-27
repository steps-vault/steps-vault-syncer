import type { FolderLayout } from '@stepsvault/sync-core';
import { useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityScreen, AudioSourcesScreen, ConnectGameScreen, GeneratorsScreen, DesktopSignInScreen, DiskFullState, EmptyVaultState, FolderLayoutScreen, JudgmentText, LinkCodeForm, LinkedComputersTable, NeedsAudioBanner,
  PermissionLostState, PhoneStatusView, SongFolderLockedState, SongsFolderMissingState, SongsFolderPreview, StatusChip, SyncHomeScreen, SyncShell, UpdateBanner, SONG_STATUSES, SONG_STATUS_DISPLAYS,
  type LinkCodeState, type SyncPlatform, type SyncScreen,
} from '../src/index';
import { FAKE_ACTIVITY_ENTRIES, FAKE_ADDON_PREVIEW, FAKE_ADDONS, FAKE_FOUND_GAMES, FAKE_FOUND_MUSICS, FAKE_GAME, FAKE_GENERATED_SONGS, FAKE_GENERATOR_JOBS, FAKE_GENERATOR_PREVIEW, FAKE_GENERATORS, FAKE_MUSIC_CHOICES, FAKE_SONG_SOURCE_TABS, FAKE_STEPSVAULT_GENERATOR, FAKE_LAYOUT_PREVIEWS, FAKE_LINKED_COMPUTERS, FAKE_MOVING_SONG_COUNTS, FAKE_MUSIC_FOLDERS, FAKE_PICKED_FILES, FAKE_PLAYER_GROUPS, FAKE_SONG_ROWS, getFakeSongDetails } from '../src/fake-data/fake-sync-data';

type PreviewScreen = 'connect' | 'connect-unsupported' | 'folder-preview' | 'songs' | 'audio-sources' | 'generators' | 'folder-layout' | 'activity' | 'account' | 'states' | 'phone';
type SyncPhase = 'idle' | 'syncing' | 'finished';

const PREVIEW_SCREENS: readonly { value: PreviewScreen; label: string }[] = [
  { value: 'connect', label: '1 · Connect your game' },
  { value: 'connect-unsupported', label: '1 · Unsupported browser' },
  { value: 'folder-preview', label: '1 · Check the folder' },
  { value: 'songs', label: '2 + 3 · Songs and details' },
  { value: 'audio-sources', label: '4 · Audio sources' },
  { value: 'generators', label: '4b · Generators, Make a song' },
  { value: 'folder-layout', label: '5 · Folder layout' },
  { value: 'activity', label: '6 · Activity' },
  { value: 'account', label: '7 · Desktop sign in, linked computers' },
  { value: 'states', label: 'States · chips, empty and errors' },
  { value: 'phone', label: 'Phone · status only' },
];

const SCREENS_BY_NAVIGATION: Readonly<Record<SyncScreen, PreviewScreen>> = { 'songs': 'songs', 'audio-sources': 'audio-sources', 'generators': 'generators', 'folder-layout': 'folder-layout', 'activity': 'activity', 'account': 'account' };

function getQueryValue<Value extends string>({ name, allowedValues, fallback }: { name: string; allowedValues: readonly Value[]; fallback: Value }): Value {
  const value = new URLSearchParams(window.location.search).get(name);
  return allowedValues.find((allowedValue) => allowedValue === value) ?? fallback;
}

function noop(): void {
  // The preview has no engine behind it; buttons that would start real work do nothing.
}

export function PreviewApp(): ReactElement {
  const [screen, setScreen] = useState<PreviewScreen>(() => getQueryValue({ name: 'screen', allowedValues: PREVIEW_SCREENS.map((option) => option.value), fallback: 'songs' }));
  const [platform, setPlatform] = useState<SyncPlatform>(() => getQueryValue({ name: 'platform', allowedValues: ['website', 'desktop'], fallback: 'website' }));
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(() => getQueryValue({ name: 'phase', allowedValues: ['idle', 'syncing', 'finished'], fallback: 'idle' }));
  return (
    <>
      <div className="preview-controls">
        <b>DanceDance Sync preview</b>
        <label>Screen <select value={screen} onChange={(event) => { setScreen(event.target.value as PreviewScreen); }}>{PREVIEW_SCREENS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Frame <select value={platform} onChange={(event) => { setPlatform(event.target.value as SyncPlatform); }}><option value="website">Website</option><option value="desktop">Desktop app</option></select></label>
        <label>Sync <select value={syncPhase} onChange={(event) => { setSyncPhase(event.target.value as SyncPhase); }}><option value="idle">Idle</option><option value="syncing">Syncing</option><option value="finished">Finished</option></select></label>
      </div>
      <PreviewFrame platform={platform} screen={screen}>
        <PreviewScreenContent screen={screen} platform={platform} syncPhase={syncPhase} onNavigate={(syncScreen) => { setScreen(SCREENS_BY_NAVIGATION[syncScreen]); }} />
      </PreviewFrame>
    </>
  );
}

function PreviewFrame({ platform, screen, children }: { platform: SyncPlatform; screen: PreviewScreen; children: ReactNode }): ReactElement {
  if (screen === 'states' || screen === 'phone') return <>{children}</>;
  if (platform === 'website') return <>{children}</>;
  return (
    <div className="preview-window">
      <div className="preview-window-bar">DanceDance Sync</div>
      {children}
    </div>
  );
}

function PreviewScreenContent({ screen, platform, syncPhase, onNavigate }: { screen: PreviewScreen; platform: SyncPlatform; syncPhase: SyncPhase; onNavigate: (screen: SyncScreen) => void }): ReactElement {
  if (screen === 'states') return <StatesBoard />;
  if (screen === 'phone') return <PhoneBoard />;
  const isBare = screen === 'connect' || screen === 'connect-unsupported' || screen === 'folder-preview';
  const currentScreen = (Object.keys(SCREENS_BY_NAVIGATION) as SyncScreen[]).find((syncScreen) => SCREENS_BY_NAVIGATION[syncScreen] === screen) ?? 'songs';
  return (
    <SyncShell
      platform={platform}
      currentScreen={currentScreen}
      onNavigate={onNavigate}
      isBare={isBare}
      desktopSidebar={{ game: FAKE_GAME, trayStatus: syncPhase === 'syncing' ? 'syncing' : 'needs-attention', playerName: 'Noa' }}
      banner={<UpdateBanner version="1.3" onRestart={noop} onLater={noop} />}
    >
      {screen === 'connect' && <ConnectPreview platform={platform} />}
      {screen === 'connect-unsupported' && <ConnectGameScreen platform="website" isBrowserSupported={false} onChooseSongsFolder={noop} desktopAppHref="#desktop-app" onCopySyncAddress={noop} />}
      {screen === 'folder-preview' && <SongsFolderPreview songsFolderPath={platform === 'website' ? 'Songs  (C:\\Games\\StepMania 5 LTEK Edition)' : FAKE_GAME.songsFolderPath} playerGroups={FAKE_PLAYER_GROUPS} layoutText="by genre" onChangeLayout={noop} onChooseAnotherFolder={noop} onContinue={noop} />}
      {screen === 'songs' && <SongsPreview platform={platform} syncPhase={syncPhase} onNavigate={onNavigate} />}
      {screen === 'audio-sources' && <AudioSourcesPreview onNavigate={onNavigate} />}
      {screen === 'generators' && <GeneratorsPreview />}
      {screen === 'folder-layout' && <FolderLayoutPreview />}
      {screen === 'activity' && <ActivityPreview />}
      {screen === 'account' && <AccountPreview />}
    </SyncShell>
  );
}

function ConnectPreview({ platform }: { platform: SyncPlatform }): ReactElement {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(FAKE_FOUND_GAMES[0]?.gameId ?? null);
  if (platform === 'website') return <ConnectGameScreen platform="website" isBrowserSupported onChooseSongsFolder={noop} desktopAppHref="#desktop-app" onCopySyncAddress={noop} />;
  return <ConnectGameScreen platform="desktop" foundGames={FAKE_FOUND_GAMES} selectedGameId={selectedGameId} searchedPlacesText="checked C:\ and D:\" onSelectGame={setSelectedGameId} onUseSelectedGame={noop} onChooseAnotherFolder={noop} />;
}

function SongsPreview({ platform, syncPhase, onNavigate }: { platform: SyncPlatform; syncPhase: SyncPhase; onNavigate: (screen: SyncScreen) => void }): ReactElement {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('drawer'));
  const [isBackgroundSyncOn, setIsBackgroundSyncOn] = useState(true);
  const [isFinishedShown, setIsFinishedShown] = useState(true);
  const isSyncing = syncPhase === 'syncing';
  const rows = isSyncing ? FAKE_SONG_ROWS.map((row, index) => ({ ...row, progress: index === 2 ? { kind: 'working' as const, step: 'lining-up' as const } : index > 2 ? { kind: 'waiting-in-line' as const } : null })) : FAKE_SONG_ROWS;
  return (
    <SyncHomeScreen
      platform={platform}
      topBar={{ game: FAKE_GAME, audioSources: { sourceNames: ['My music folder', 'Open Audio Links'] }, lastSync: { timeText: 'Today, 18:42', noteText: '2 hours ago' }, onSyncNow: noop, onChangeGame: noop, onManageAudioSources: () => { onNavigate('audio-sources'); }, backgroundSync: platform === 'desktop' ? { isOn: isBackgroundSyncOn, onToggle: setIsBackgroundSyncOn } : undefined }}
      syncRun={isSyncing ? { currentSongNumber: 7, totalSongCount: 12, currentStepText: 'Lining up the steps · Sugar You' } : null}
      finishedSync={syncPhase === 'finished' && isFinishedShown ? { syncedCount: 8, needsYouCount: 4 } : null}
      onSeeActivity={() => { onNavigate('activity'); }}
      onDismissFinishedSync={() => { setIsFinishedShown(false); }}
      songs={rows}
      selectedSongDetails={selectedSongId === null ? null : getFakeSongDetails(selectedSongId)}
      onOpenSongDetails={setSelectedSongId}
      onCloseSongDetails={() => { setSelectedSongId(null); }}
      onSongAction={noop}
    />
  );
}

function AudioSourcesPreview({ onNavigate }: { onNavigate: (screen: SyncScreen) => void }): ReactElement {
  const [addons, setAddons] = useState(FAKE_ADDONS);
  return (
    <AudioSourcesScreen
      musicFolders={FAKE_MUSIC_FOLDERS}
      scan={{ scannedFileCount: 241, percent: 62 }}
      matchedSongCount={8}
      vaultSongCount={12}
      pickedFiles={FAKE_PICKED_FILES}
      addons={addons}
      onAddMusicFolder={noop}
      onRemoveMusicFolder={noop}
      onScanAgain={noop}
      onGoToSongs={() => { onNavigate('songs'); }}
      onToggleAddon={({ addonId, isEnabled }) => { setAddons(addons.map((addon) => (addon.addonId === addonId ? { ...addon, isEnabled } : addon))); }}
      onRemoveAddon={(addonId) => { setAddons(addons.filter((addon) => addon.addonId !== addonId)); }}
      onSetAddonOption={({ addonId, optionId, value }) => { setAddons(addons.map((addon) => (addon.addonId === addonId ? { ...addon, options: addon.options.map((option) => (option.optionId === optionId ? { ...option, value } : option)) } : addon))); }}
      onLookUpAddon={({ address }) => Promise.resolve({ kind: 'found', addon: { ...FAKE_ADDON_PREVIEW, address } })}
      onInstallAddon={(addon) => { setAddons([...addons, { addonId: addon.address, name: addon.name, version: addon.version, author: addon.author, providesText: 'audio links', isEnabled: true, isNew: true, health: { kind: 'working', note: 'Installed just now · checks for audio on your next sync' }, options: addon.options }]); }}
    />
  );
}

function GeneratorsPreview(): ReactElement {
  const [generators, setGenerators] = useState(FAKE_GENERATORS);
  return (
    <GeneratorsScreen
      stepsVaultGenerator={FAKE_STEPSVAULT_GENERATOR}
      generators={generators}
      jobs={FAKE_GENERATOR_JOBS}
      generatedSongs={FAKE_GENERATED_SONGS}
      canUseStartCommand
      songSourceTabs={FAKE_SONG_SOURCE_TABS}
      onLookUpGenerator={({ address }) => Promise.resolve({ kind: 'found', generator: { ...FAKE_GENERATOR_PREVIEW, address } })}
      onAddGenerator={(preview) => { setGenerators([...generators, { generatorId: preview.address, name: preview.name, version: preview.version, author: preview.author, description: preview.description, location: preview.location, startCommand: preview.startCommand, difficulties: preview.difficulties, options: preview.options, musicUploadWarning: null, isNew: true }]); }}
      onRemoveGenerator={(generatorId) => { setGenerators(generators.filter((generator) => generator.generatorId !== generatorId)); }}
      onSetGeneratorOption={noop}
      onChooseMusicFile={() => Promise.resolve({ musicId: 'picked-file', title: 'my new song', artist: 'Unknown artist', sourceText: 'my_new_song.mp3', lengthText: '3:05', hasVideo: false })}
      onSearchMusic={() => Promise.resolve(FAKE_MUSIC_CHOICES)}
      onFindSong={() => Promise.resolve({ kind: 'found', musics: FAKE_FOUND_MUSICS })}
      onStopFindingSong={noop}
      onMakeSong={() => Promise.resolve({ kind: 'started', jobKey: 'job-night-drive' })}
      onCancelJob={noop}
      onAnswerVaultChoice={noop}
      onDismissJob={noop}
      onFetchSongReport={() => Promise.resolve('# How it was made\n\nOnsets found with a simple energy rule, arrows by flow.')}
      mySongsHref="#my-songs"
    />
  );
}

function FolderLayoutPreview(): ReactElement {
  const [currentLayout, setCurrentLayout] = useState<FolderLayout>('by-genre');
  const [lastMove, setLastMove] = useState<{ layout: FolderLayout; movedSongCount: number } | null>(null);
  return (
    <FolderLayoutScreen
      currentLayout={currentLayout}
      previewsByLayout={FAKE_LAYOUT_PREVIEWS}
      movingSongCountsByLayout={FAKE_MOVING_SONG_COUNTS}
      playerGroupNames={FAKE_PLAYER_GROUPS.map((group) => group.groupName)}
      onChangeLayout={(layout) => { setLastMove({ layout, movedSongCount: FAKE_MOVING_SONG_COUNTS[layout] }); setCurrentLayout(layout); }}
      lastMove={lastMove}
    />
  );
}

function ActivityPreview(): ReactElement {
  const [wasCopied, setWasCopied] = useState(false);
  return <ActivityScreen entries={FAKE_ACTIVITY_ENTRIES} wasCopied={wasCopied} onCopyDetails={() => { setWasCopied(true); }} hasOlderEntries onShowOlder={noop} />;
}

function AccountPreview(): ReactElement {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [characters, setCharacters] = useState<string[]>(['K', '7', 'Q', '4', '', '']);
  const [linkCodeState, setLinkCodeState] = useState<LinkCodeState>('typing');
  const [computers, setComputers] = useState(FAKE_LINKED_COMPUTERS);
  return (
    <div className="sv-sync-screen">
      <div className="preview-pair">
        <div className="preview-card">
          <DesktopSignInScreen signIn={isSignedIn ? { kind: 'signed-in', playerName: 'Noa', computerName: 'LIVING-ROOM-PC' } : { kind: 'waiting-for-code', code: 'K7Q4ZP', expiresInText: '9:12', computerName: 'LIVING-ROOM-PC', systemName: 'Windows 11' }} onOpenLinkPage={noop} onGetNewCode={noop} onConnectGame={noop} />
        </div>
        <div className="preview-card">
          <LinkCodeForm characters={characters} state={linkCodeState} computerText="LIVING-ROOM-PC · Windows 11 · StepsVault Sync 1.2" linkedComputerName="LIVING-ROOM-PC" onChangeCharacters={(next) => { setCharacters(next); setLinkCodeState('typing'); }} onSubmitCode={(code) => { setLinkCodeState(code === 'K7Q4ZP' ? 'great' : 'miss'); }} onLinkComputer={() => { setLinkCodeState('linked'); setIsSignedIn(true); }} onTryAgain={() => { setCharacters(['', '', '', '', '', '']); setLinkCodeState('typing'); }} />
        </div>
      </div>
      <h2 className="sv-sync-heading-2">Your linked computers</h2>
      <LinkedComputersTable computers={computers} onRemoveComputer={(computerId) => { setComputers(computers.filter((computer) => computer.computerId !== computerId)); }} />
    </div>
  );
}

function StatesBoard(): ReactElement {
  return (
    <div className="sv-sync-root sv-sync-stage">
      <div className="preview-board">
        <section>
          <h2 className="preview-section-title">Status chips · used everywhere</h2>
          <div className="preview-chips">{SONG_STATUSES.map((status) => <span key={status} title={SONG_STATUS_DISPLAYS[status].meaning}><StatusChip status={status} /></span>)}</div>
        </section>
        <section>
          <h2 className="preview-section-title">Many songs at once</h2>
          <NeedsAudioBanner songCount={17} onAddMusicFolder={noop} onDismiss={noop} />
        </section>
        <section>
          <h2 className="preview-section-title">Empty + error states</h2>
          <div className="preview-grid">
            <EmptyVaultState vaultHref="#vault" />
            <PermissionLostState onReconnect={noop} />
            <SongsFolderMissingState previousSongsFolderPath={FAKE_GAME.songsFolderPath} onChooseFolder={noop} />
            <DiskFullState neededSpaceText="48 MB" songCount={3} driveName="C:" onTryAgain={noop} />
            <SongFolderLockedState songTitle="Watch Me Glow" onTryAgain={noop} />
          </div>
        </section>
        <section>
          <h2 className="preview-section-title">End of a sync · judgment words</h2>
          <div className="preview-chips"><JudgmentText word="FLAWLESS!!" /><JudgmentText word="PERFECT!" /><JudgmentText word="GREAT" /><JudgmentText word="MISS" /></div>
        </section>
      </div>
    </div>
  );
}

function PhoneBoard(): ReactElement {
  return (
    <div className="sv-sync-root sv-sync-stage">
      <div className="preview-board">
        <div className="preview-phone">
          <div>
            <PhoneStatusView computerName="LIVING-ROOM-PC" gameName="StepMania 5 LTEK" overallStatus="synced" lastSyncText="2 hours ago" syncedCount={8} needsAudioCount={2} updateCount={2} songs={FAKE_SONG_ROWS.slice(0, 4).map((row) => ({ vaultSongId: row.vaultSongId, title: row.title, coverArtUrl: row.coverArtUrl, status: row.status }))} />
          </div>
        </div>
      </div>
    </div>
  );
}
