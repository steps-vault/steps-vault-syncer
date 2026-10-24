import path from 'node:path';
import { BrowserWindow, shell, type WebPreferences } from 'electron';

const RENDERER_FOLDER = path.join(__dirname, '..', 'renderer');
const PRELOAD_FOLDER = path.join(__dirname, '..', 'preload');

/** Every window: no Node, an isolated preload, Chromium's sandbox, and nothing loaded from the network. */
function getLockedDownPreferences(preloadFileName: string): WebPreferences {
  return {
    preload: path.join(PRELOAD_FOLDER, preloadFileName),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
  };
}

/** Links never open inside the app; https ones open in the player's browser, anything else is ignored. */
function keepNavigationInside(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (url.startsWith('https://')) void shell.openExternal(url);
  });
}

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'StepsVault Sync',
    backgroundColor: '#0b0b12',
    show: false,
    webPreferences: getLockedDownPreferences('app-preload.cjs'),
  });
  keepNavigationInside(window);
  window.once('ready-to-show', () => {
    window.show();
  });
  void window.loadFile(path.join(RENDERER_FOLDER, 'index.html'));
  return window;
}

/** Never shown: it decodes audio with Chromium's own decoder, so syncing works with the main window closed. */
export function createAudioWindow(): BrowserWindow {
  const window = new BrowserWindow({ show: false, webPreferences: { ...getLockedDownPreferences('audio-preload.cjs'), backgroundThrottling: false } });
  keepNavigationInside(window);
  void window.loadFile(path.join(RENDERER_FOLDER, 'audio.html'));
  return window;
}
