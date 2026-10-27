import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import type { TrayStatus } from '@stepsvault/sync-ui';

const ICON_SIZE = 16;
/** Lime when synced, blue while syncing, gold when songs need the player, grey when paused (as the status chips). */
const COLORS_BY_STATUS: Readonly<Record<TrayStatus, readonly [number, number, number]>> = {
  synced: [164, 255, 0],
  syncing: [52, 191, 255],
  'needs-attention': [255, 198, 0],
  paused: [200, 200, 200],
};
const TOOLTIPS_BY_STATUS: Readonly<Record<TrayStatus, string>> = {
  synced: 'DanceDance Sync · everything is in your game',
  syncing: 'DanceDance Sync · syncing…',
  'needs-attention': 'DanceDance Sync · some songs need you',
  paused: 'DanceDance Sync · paused',
};

/** A small up-arrow, drawn in code so the app ships no icon files that could go missing. */
function buildArrowIcon(status: TrayStatus): NativeImage {
  const [red, green, blue] = COLORS_BY_STATUS[status];
  const pixels = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  for (let y = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1) {
      const isHead = y < 8 && Math.abs(x - 7.5) <= y;
      const isShaft = y >= 8 && x >= 5 && x <= 10;
      if (!isHead && !isShaft) continue;
      const offset = (y * ICON_SIZE + x) * 4;
      pixels.set([blue, green, red, 255], offset);
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: ICON_SIZE, height: ICON_SIZE });
}

export interface TrayActions {
  onOpen: () => void;
  onSyncNow: () => void;
  onTogglePause: () => void;
  onQuit: () => void;
}

export class SyncTray {
  private readonly tray: Tray;
  private readonly actions: TrayActions;
  private status: TrayStatus | null = null;

  constructor(actions: TrayActions) {
    this.actions = actions;
    this.tray = new Tray(buildArrowIcon('synced'));
    this.tray.on('click', actions.onOpen);
    this.show('synced');
  }

  show(status: TrayStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.tray.setImage(buildArrowIcon(status));
    this.tray.setToolTip(TOOLTIPS_BY_STATUS[status]);
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open', click: this.actions.onOpen },
        { label: 'Sync now', click: this.actions.onSyncNow },
        { label: status === 'paused' ? 'Resume' : 'Pause', click: this.actions.onTogglePause },
        { type: 'separator' },
        { label: 'Quit', click: this.actions.onQuit },
      ]),
    );
  }
}
