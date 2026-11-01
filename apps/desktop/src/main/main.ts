import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } from 'electron';
import { BRIDGE_CHANNEL_PREFIX, BRIDGE_METHOD_NAMES, STATE_CHANNEL, type DesktopSyncState } from '../shared/bridge-types';
import { AudioBridge } from './audio-bridge';
import { buildBridgeHandlers } from './bridge-handlers';
import { DEFAULT_SITE_URL } from './desktop-settings';
import { DeviceTokenStore } from './device-token-store';
import { getLocalBridgeOrigins } from './local-bridge-origins';
import { SafePairedBrowserStore } from './paired-browser-store';
import { isGameRunning } from './game-process';
import { SyncController } from './sync-controller';
import { findSyncLinkInArguments, getMakeSongLinkOrNull, SYNC_LINK_SCHEME, type MakeSongLink } from './sync-link';
import { SyncTray } from './tray';
import { installUpdateNow, startUpdateChecks } from './updates';
import { createAudioWindow, createMainWindow } from './windows';

const BACKGROUND_SYNC_MINUTES = 15;
const AUDIO_FILE_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'webm'];

let mainWindow: BrowserWindow | null = null;
let audioWindow: BrowserWindow | null = null;
let isQuitting = false;
let syncController: SyncController | null = null;
/** A link that arrived before the controller was ready (a cold start, or macOS's open-url before ready). */
let waitingMakeSongLink: MakeSongLink | null = null;

/** STEPSVAULT_SITE_URL points the app at a test site (for example the site running on this computer). */
function getSiteUrl(): string {
  return process.env.STEPSVAULT_SITE_URL ?? DEFAULT_SITE_URL;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    mainWindow.on('close', (event) => {
      // Closing the window keeps Sync in the tray; Quit in the tray menu really quits.
      if (isQuitting) return;
      event.preventDefault();
      mainWindow?.hide();
    });
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** A clicked dancedance-sync link: anything but a valid Make a song link only brings the window forward. */
function handleSyncLink(link: string | null): void {
  const makeSongLink = link === null ? null : getMakeSongLinkOrNull(link);
  if (makeSongLink && syncController) syncController.openMakeSongLink(makeSongLink);
  else if (makeSongLink) waitingMakeSongLink = makeSongLink;
  if (app.isReady()) showMainWindow();
}

/**
 * The installer registers the link scheme for the installed app; registering again at every start keeps it pointing at
 * this copy. A development run registers only when asked (STEPSVAULT_REGISTER_LINKS=1), so it never takes the links
 * away from the installed app by surprise.
 */
function registerSyncLinkScheme(): void {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(SYNC_LINK_SCHEME);
    return;
  }
  const appFolder = process.argv[1];
  if (process.env.STEPSVAULT_REGISTER_LINKS && appFolder) app.setAsDefaultProtocolClient(SYNC_LINK_SCHEME, process.execPath, [path.resolve(appFolder)]);
}

function getAudioWindow(): BrowserWindow {
  if (!audioWindow || audioWindow.isDestroyed()) audioWindow = createAudioWindow();
  return audioWindow;
}

/** The Windows computer name, as the player sees it on the site before linking. */
function getComputerName(): string {
  return (process.env.COMPUTERNAME ?? os.hostname()).toUpperCase();
}

function getSystemName(): string {
  if (process.platform === 'win32') return Number(os.release().split('.')[2] ?? 0) >= 22000 ? 'Windows 11' : 'Windows 10';
  return os.type();
}

function createController(tray: { show: (status: DesktopSyncState['trayStatus']) => void }): SyncController {
  return new SyncController({
    dataFolder: app.getPath('userData'),
    appDataFolder: app.getPath('appData'),
    siteUrl: getSiteUrl(),
    appVersion: app.getVersion(),
    computerName: getComputerName(),
    systemName: getSystemName(),
    tokenStore: new DeviceTokenStore({ dataFolder: app.getPath('userData') }),
    pairedBrowserStore: new SafePairedBrowserStore({ dataFolder: app.getPath('userData') }),
    bridgeOrigins: getLocalBridgeOrigins({ isPackaged: app.isPackaged, siteUrl: getSiteUrl(), developmentOriginsText: process.env.STEPSVAULT_BRIDGE_DEV_ORIGINS }),
    audioBridge: new AudioBridge({ ipcMain, getAudioWindow }),
    services: {
      chooseFolder: async (title) => (await dialog.showOpenDialog({ title, properties: ['openDirectory'] })).filePaths[0] ?? null,
      chooseAudioFile: async () => (await dialog.showOpenDialog({ title: 'Choose this song’s music', properties: ['openFile'], filters: [{ name: 'Music', extensions: AUDIO_FILE_EXTENSIONS }] })).filePaths[0] ?? null,
      openExternal: (url) => shell.openExternal(url),
      writeClipboard: (text) => clipboard.writeText(text),
      isGameRunning,
      confirmStartCommand: async ({ address, command, folder }) => {
        const options = {
          type: 'warning' as const,
          buttons: ['Allow', 'Don’t allow'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
          title: 'Run a program on this computer?',
          message: `Let DanceDance Sync run this command when it needs ${address}?`,
          detail: `${command}

It runs in ${folder}, and Sync stops it after 10 minutes without use. Only allow a command you typed yourself and trust.`,
        };
        const answer = mainWindow && !mainWindow.isDestroyed() ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
        return answer.response === 0;
      },
      installUpdate: () => {
        isQuitting = true;
        installUpdateNow();
      },
    },
    onStateChange: (state) => {
      tray.show(state.trayStatus);
      if (process.env.STEPSVAULT_LOG_STATE) logStateSummary(state);
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(STATE_CHANNEL, state);
    },
  });
}

/** STEPSVAULT_LOG_STATE=1 prints one line per change, for support and end-to-end tests. Never includes the token. */
function logStateSummary(state: DesktopSyncState): void {
  const signIn = state.signIn.kind === 'waiting-for-code' ? `code ${state.signIn.code}` : state.signIn.kind;
  const songs = state.songs.map((song) => `${song.title}=${song.status}`).join(', ');
  const run = state.syncRun ? `syncing ${String(state.syncRun.currentSongNumber)}/${String(state.syncRun.totalSongCount)} ${state.syncRun.currentStepText}` : 'idle';
  const preselectedSong = state.preselectedSong ? `${state.preselectedSong.title} / ${state.preselectedSong.artist ?? 'no artist'}` : 'none';
  console.log(`[state] ${signIn} | game ${state.game?.songsFolderPath ?? 'none'} | ${run} | songs: ${songs || 'none'} | make a song: ${preselectedSong} | problem: ${state.problem ?? 'none'}`);
}

/** Each bridge method is one invoke channel; calls are accepted only from the app's own main window. */
function registerBridge(controller: SyncController): void {
  const handlers = buildBridgeHandlers(controller);
  for (const methodName of BRIDGE_METHOD_NAMES) {
    ipcMain.handle(`${BRIDGE_CHANNEL_PREFIX}${methodName}`, (event, argument: unknown) => {
      if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Only the DanceDance Sync window may do this.');
      return handlers[methodName](argument);
    });
  }
}

/** Nothing the windows load may come from the network: the pages and scripts are all inside the app. */
function denyNetworkFromWindows(): void {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const isLocal = details.url.startsWith('file://') || details.url.startsWith('devtools://');
    callback({ cancel: !isLocal });
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

async function start(): Promise<void> {
  await app.whenReady();
  denyNetworkFromWindows();
  // The tray needs the controller and the controller reports to the tray, so the tray reaches it through this holder.
  const controllerHolder: { current: SyncController | null } = { current: null };
  const tray = new SyncTray({
    onOpen: showMainWindow,
    onSyncNow: () => void controllerHolder.current?.syncNow(),
    onTogglePause: () => {
      const controller = controllerHolder.current;
      if (controller) void controller.setBackgroundSync(!controller.isBackgroundSyncOn);
    },
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
  const controller = createController(tray);
  controllerHolder.current = controller;
  syncController = controller;
  if (waitingMakeSongLink) controller.openMakeSongLink(waitingMakeSongLink);
  waitingMakeSongLink = null;
  registerSyncLinkScheme();
  registerBridge(controller);
  app.on('will-quit', () => {
    void controller.shutdown();
  });
  getAudioWindow();
  showMainWindow();
  await controller.initialize();
  startUpdateChecks({ onUpdateReady: (version) => { controller.setUpdateReady(version); } });
  void controller.syncNow();
  setInterval(() => {
    if (controller.isBackgroundSyncOn) void controller.syncNow();
  }, BACKGROUND_SYNC_MINUTES * 60 * 1000);
}

// STEPSVAULT_USER_DATA_DIR keeps a test run's settings, record and token apart from the player's own.
if (process.env.STEPSVAULT_USER_DATA_DIR) app.setPath('userData', process.env.STEPSVAULT_USER_DATA_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Windows starts a second copy with the clicked link as an argument; that copy quits at once and hands it over here.
  app.on('second-instance', (_event, commandLine) => {
    handleSyncLink(findSyncLinkInArguments(commandLine));
  });
  // macOS hands links over with open-url, before the app is ready on a cold start.
  app.on('open-url', (event, link) => {
    event.preventDefault();
    handleSyncLink(link);
  });
  handleSyncLink(findSyncLinkInArguments(process.argv));
  app.on('window-all-closed', () => {
    // Stay in the tray: background sync keeps working with every window closed.
  });
  app.on('before-quit', () => {
    isQuitting = true;
  });
  void start();
}
