import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { BRIDGE_CHANNEL_PREFIX, BRIDGE_METHOD_NAMES, STATE_CHANNEL, type DesktopSyncBridge, type DesktopSyncState } from '../shared/bridge-types';

/** Exactly the named methods, each a plain invoke: the window gets no ipcRenderer, no Node and no file access. */
function buildBridge(): DesktopSyncBridge {
  const methods = Object.fromEntries(BRIDGE_METHOD_NAMES.map((name) => [name, (argument?: unknown) => ipcRenderer.invoke(`${BRIDGE_CHANNEL_PREFIX}${name}`, argument)]));
  return {
    ...(methods as Omit<DesktopSyncBridge, 'onState'>),
    onState: (listener) => {
      const handleState = (_event: IpcRendererEvent, state: DesktopSyncState) => {
        listener(state);
      };
      ipcRenderer.on(STATE_CHANNEL, handleState);
      return () => ipcRenderer.removeListener(STATE_CHANNEL, handleState);
    },
  };
}

contextBridge.exposeInMainWorld('stepsVaultSync', buildBridge());
