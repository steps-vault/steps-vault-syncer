import { describe, expect, it, vi } from 'vitest';
import { buildBridgeHandlers, InvalidBridgeArgumentError } from './bridge-handlers';
import type { SyncController } from './sync-controller';

function buildRecordingController(): { controller: SyncController; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const controller = new Proxy({}, { get: (_target, name) => vi.fn((...arguments_: unknown[]) => { calls.push([name, ...arguments_]); return Promise.resolve(); }) }) as unknown as SyncController;
  return { controller, calls };
}

describe('bridge handlers', () => {
  it('passes checked arguments to the controller', async () => {
    const { controller, calls } = buildRecordingController();
    const handlers = buildBridgeHandlers(controller);
    await handlers.runSongAction({ vaultSongId: 'song_7', action: 'choose-audio' });
    await handlers.setLayout('by-genre');
    await handlers.setAddonEnabled({ addonId: 'indie.tapes', isEnabled: false });
    expect(calls).toEqual([
      ['runSongAction', { vaultSongId: 'song_7', action: 'choose-audio' }],
      ['setLayout', 'by-genre'],
      ['setAddonEnabled', { addonId: 'indie.tapes', isEnabled: false }],
    ]);
  });

  it.each([
    ['runSongAction', { vaultSongId: 'song_7', action: 'delete-everything' }],
    ['runSongAction', { vaultSongId: 42, action: 'sync' }],
    ['setLayout', 'C:\\Windows'],
    ['setBackgroundSync', 'yes'],
    ['useFoundGame', 'x'.repeat(5_000)],
    ['installAddon', null],
    ['removeMusicFolder', { path: 'C:\\' }],
  ] as const)('refuses %s with %j before it reaches the controller', async (methodName, argument) => {
    const { controller, calls } = buildRecordingController();
    const handlers = buildBridgeHandlers(controller);
    await expect(Promise.resolve().then(() => handlers[methodName](argument))).rejects.toThrow(InvalidBridgeArgumentError);
    expect(calls).toEqual([]);
  });
});
