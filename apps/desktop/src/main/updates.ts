import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

const CHECK_EVERY_HOURS = 6;

/**
 * New versions come from this repo's GitHub releases. They download quietly, then the "update ready" banner asks the
 * player to restart; an update is also installed when the app quits. Only the installed app checks: a build run from
 * source has nothing to update.
 */
export function startUpdateChecks({ onUpdateReady }: { onUpdateReady: (version: string) => void }): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    onUpdateReady(info.version);
  });
  autoUpdater.on('error', (error) => {
    // A failed check (offline, GitHub busy) is not the player's problem; the next check tries again.
    console.warn(`Update check failed: ${error.message}`);
  });
  const check = () => {
    autoUpdater.checkForUpdates().catch(() => undefined);
  };
  check();
  setInterval(check, CHECK_EVERY_HOURS * 60 * 60 * 1000);
}

export function installUpdateNow(): void {
  autoUpdater.quitAndInstall(false, true);
}
