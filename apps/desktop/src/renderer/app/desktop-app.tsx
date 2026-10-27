import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
  ActivityScreen,
  AudioSourcesScreen,
  ConnectGameScreen,
  DesktopSignInScreen,
  EmptyVaultState,
  FolderLayoutScreen,
  GeneratorsScreen,
  SyncHomeScreen,
  SyncLoadingPanel,
  SyncShell,
  UpdateBanner,
  type SyncScreen,
} from '@stepsvault/sync-ui';
import type { DesktopSyncBridge, DesktopSyncState } from '../../shared/bridge-types';

declare global {
  interface Window {
    stepsVaultSync: DesktopSyncBridge;
  }
}

const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Renders the state the main process sends, and turns clicks into bridge calls. It holds no sync logic itself. */
export function DesktopApp({ bridge }: { bridge: DesktopSyncBridge }): ReactElement {
  const state = useDesktopState(bridge);
  const [currentScreen, setCurrentScreen] = useState<SyncScreen>('songs');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [wasActivityCopied, setWasActivityCopied] = useState(false);
  if (!state) return <div className="sv-sync-root sv-sync-stage sv-desktop-loading" aria-busy="true"><SyncLoadingPanel /></div>;
  if (state.signIn.kind !== 'signed-in') return <SignInFrame state={state} bridge={bridge} />;
  if (!state.game) return <ConnectFrame state={state} bridge={bridge} />;
  const connectedState = { ...state, game: state.game };
  return (
    <SyncShell
      platform="desktop"
      currentScreen={currentScreen}
      onNavigate={setCurrentScreen}
      desktopSidebar={{ game: state.game, trayStatus: state.trayStatus, playerName: state.signIn.computerName }}
      banner={state.updateVersion ? <UpdateBanner version={state.updateVersion} onRestart={() => void bridge.restartToUpdate()} onLater={() => void bridge.dismissUpdate()} /> : undefined}
    >
      {state.problem ? <p className="sv-desktop-problem" role="alert">{state.problem}</p> : null}
      {renderScreen({ currentScreen, state: connectedState, bridge, selectedSongId, setSelectedSongId, setCurrentScreen, wasActivityCopied, setWasActivityCopied })}
    </SyncShell>
  );
}

function useDesktopState(bridge: DesktopSyncBridge): DesktopSyncState | null {
  const [state, setState] = useState<DesktopSyncState | null>(null);
  useEffect(() => {
    void bridge.getState().then(setState);
    return bridge.onState(setState);
  }, [bridge]);
  return state;
}

function SignInFrame({ state, bridge }: { state: DesktopSyncState; bridge: DesktopSyncBridge }): ReactElement {
  useEffect(() => {
    if (state.signIn.kind === 'signed-out') void bridge.startSignIn();
  }, [state.signIn.kind, bridge]);
  const signIn = state.signIn.kind === 'waiting-for-code'
    ? { kind: 'waiting-for-code' as const, code: `${state.signIn.code.slice(0, 3)}·${state.signIn.code.slice(3)}`, expiresInText: getExpiresInText(state.signIn.expiresAt), computerName: state.signIn.computerName, systemName: state.signIn.systemName }
    : { kind: 'waiting-for-code' as const, code: '···', expiresInText: 'Getting a code…', computerName: '', systemName: '' };
  return (
    <SyncShell platform="desktop" currentScreen="account" onNavigate={() => undefined} isBare>
      {state.problem ? <p className="sv-desktop-problem" role="alert">{state.problem}</p> : null}
      <DesktopSignInScreen signIn={signIn} onOpenLinkPage={() => void bridge.openLinkPage()} onGetNewCode={() => void bridge.startSignIn()} onConnectGame={() => undefined} />
    </SyncShell>
  );
}

function ConnectFrame({ state, bridge }: { state: DesktopSyncState; bridge: DesktopSyncBridge }): ReactElement {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(state.foundGames[0]?.gameId ?? null);
  return (
    <SyncShell platform="desktop" currentScreen="songs" onNavigate={() => undefined} isBare>
      <ConnectGameScreen
        platform="desktop"
        foundGames={state.foundGames}
        selectedGameId={selectedGameId}
        searchedPlacesText={state.searchedPlacesText}
        onSelectGame={setSelectedGameId}
        onUseSelectedGame={() => {
          if (selectedGameId) void bridge.useFoundGame(selectedGameId);
        }}
        onChooseAnotherFolder={() => void bridge.chooseSongsFolder()}
      />
    </SyncShell>
  );
}

interface ScreenOptions {
  currentScreen: SyncScreen;
  state: DesktopSyncState & { game: NonNullable<DesktopSyncState['game']> };
  bridge: DesktopSyncBridge;
  selectedSongId: string | null;
  setSelectedSongId: (vaultSongId: string | null) => void;
  setCurrentScreen: (screen: SyncScreen) => void;
  wasActivityCopied: boolean;
  setWasActivityCopied: (wasCopied: boolean) => void;
}

function renderScreen(options: ScreenOptions): ReactNode {
  const { state, bridge } = options;
  if (options.currentScreen === 'audio-sources') return renderAudioSources(options);
  if (options.currentScreen === 'generators') return renderGenerators(options);
  if (options.currentScreen === 'folder-layout') {
    return <FolderLayoutScreen currentLayout={state.layout} previewsByLayout={state.previewsByLayout} movingSongCountsByLayout={state.movingSongCountsByLayout} playerGroupNames={state.playerGroupNames} onChangeLayout={(layout) => void bridge.setLayout(layout)} lastMove={state.lastLayoutMove} editGroupsHref={`${state.siteUrl}/library?tab=groups`} />;
  }
  if (options.currentScreen === 'activity') {
    return (
      <ActivityScreen
        entries={state.activity}
        onCopyDetails={() => {
          void bridge.copyActivityDetails().then(() => {
            options.setWasActivityCopied(true);
          });
        }}
        wasCopied={options.wasActivityCopied}
        hasOlderEntries={false}
        onShowOlder={() => undefined}
        onGoToSongs={() => {
          options.setCurrentScreen('songs');
        }}
      />
    );
  }
  return renderSongs(options);
}

function renderSongs({ state, bridge, selectedSongId, setSelectedSongId, setCurrentScreen }: ScreenOptions): ReactNode {
  const needsAudioCount = state.songs.filter((song) => song.status === 'needs-audio').length;
  return (
    <SyncHomeScreen
      platform="desktop"
      topBar={{
        game: state.game,
        audioSources: { sourceNames: [...(state.musicFolders.length > 0 ? ['My music folder'] : []), ...state.addons.filter((addon) => addon.isEnabled && addon.isAudioSource !== false).map((addon) => addon.name)] },
        lastSync: state.lastSyncAt ? { timeText: TIME_FORMAT.format(new Date(state.lastSyncAt)), noteText: '' } : null,
        onSyncNow: () => void bridge.syncNow(),
        onChangeGame: () => void bridge.chooseSongsFolder(),
        onManageAudioSources: () => {
          setCurrentScreen('audio-sources');
        },
        backgroundSync: { isOn: state.isBackgroundSyncOn, onToggle: (isOn) => void bridge.setBackgroundSync(isOn) },
      }}
      syncRun={state.syncRun}
      finishedSync={state.finishedSync}
      onSeeActivity={() => {
        setCurrentScreen('activity');
      }}
      onDismissFinishedSync={() => void bridge.dismissFinishedSync()}
      needsAudioBanner={needsAudioCount >= 3 && state.musicFolders.length === 0 ? { songCount: needsAudioCount, onAddMusicFolder: () => void bridge.addMusicFolder(), onDismiss: () => undefined } : null}
      songs={state.songs}
      emptyState={state.songs.length === 0 && !state.syncRun ? <EmptyVaultState vaultHref={state.siteUrl} /> : undefined}
      selectedSongDetails={selectedSongId ? (state.songDetailsById[selectedSongId] ?? null) : null}
      onOpenSongDetails={setSelectedSongId}
      onCloseSongDetails={() => {
        setSelectedSongId(null);
      }}
      onSongAction={(request) => void bridge.runSongAction(request)}
    />
  );
}

function renderAudioSources({ state, bridge, setCurrentScreen }: ScreenOptions): ReactNode {
  return (
    <AudioSourcesScreen
      musicFolders={state.musicFolders}
      scan={state.scannedFileCount !== null && state.musicFolders.some((folder) => folder.scanState === 'scanning') ? { scannedFileCount: state.scannedFileCount, percent: 50 } : null}
      matchedSongCount={state.songs.filter((song) => song.audioSource.kind === 'music-folder').length}
      vaultSongCount={state.songs.length}
      pickedFiles={state.pickedFiles}
      addons={state.addons}
      onAddMusicFolder={() => void bridge.addMusicFolder()}
      onRemoveMusicFolder={(folderPath) => void bridge.removeMusicFolder(folderPath)}
      onScanAgain={() => void bridge.scanMusicAgain()}
      onGoToSongs={() => {
        setCurrentScreen('songs');
      }}
      onToggleAddon={(request) => void bridge.setAddonEnabled(request)}
      onRemoveAddon={(addonId) => void bridge.removeAddon(addonId)}
      onSetAddonOption={(request) => void bridge.setAddonOption(request)}
      onLookUpAddon={(request) => bridge.lookUpAddon(request)}
      onInstallAddon={(addon) => void bridge.installAddon(addon)}
      canUseStartCommand
    />
  );
}

function renderGenerators({ state, bridge }: ScreenOptions): ReactNode {
  return (
    <GeneratorsScreen
      stepsVaultGenerator={state.stepsVaultGenerator}
      generators={state.generators}
      jobs={state.generatorJobs}
      generatedSongs={state.generatedSongs}
      songSourceTabs={state.songSourceTabs}
      canUseStartCommand
      onLookUpGenerator={(request) => bridge.lookUpGenerator(request)}
      onAddGenerator={(generator) => void bridge.installGenerator(generator)}
      onRemoveGenerator={(generatorId) => void bridge.removeGenerator(generatorId)}
      onSetGeneratorOption={(change) => void bridge.setGeneratorOption(change)}
      onChooseMusicFile={() => bridge.chooseMusicFileForSong()}
      onSearchMusic={(query) => bridge.searchMusicFolders(query)}
      onFindSong={(request) => bridge.findSongWithSource(request)}
      onStopFindingSong={() => void bridge.stopFindingSong()}
      onMakeSong={(request) => bridge.makeSong(request)}
      onCancelJob={(jobKey) => void bridge.cancelGeneratorJob(jobKey)}
      onAnswerVaultChoice={(answer) => void bridge.answerVaultChoice(answer)}
      onDismissJob={(jobKey) => void bridge.dismissGeneratorJob(jobKey)}
      onFetchSongReport={(songKey) => bridge.fetchGeneratedSongReport(songKey)}
      mySongsHref={`${state.siteUrl}/my-songs`}
    />
  );
}

function getExpiresInText(expiresAt: string): string {
  const minutes = Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000));
  return `${String(minutes)} min`;
}
