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
    await handlers.setAddonOption({ addonId: 'indie.tapes', optionId: 'media', value: 'audio', extra: 'dropped' });
    await handlers.installAddon({ address: 'https://tapes.example.org', name: 'Indie Tapes', version: '1.0.0', author: 'hyperpad', options: [{ optionId: 'media', label: 'What to get', choices: [{ value: 'audio', label: 'Music only' }, { value: 'audio-and-video', label: 'Music and video' }], value: 'audio' }] });
    expect(calls).toEqual([
      ['runSongAction', { vaultSongId: 'song_7', action: 'choose-audio' }],
      ['setLayout', 'by-genre'],
      ['setAddonEnabled', { addonId: 'indie.tapes', isEnabled: false }],
      ['setAddonOption', { addonId: 'indie.tapes', optionId: 'media', value: 'audio' }],
      ['installAddon', { address: 'https://tapes.example.org', name: 'Indie Tapes', version: '1.0.0', author: 'hyperpad', options: [{ optionId: 'media', label: 'What to get', choices: [{ value: 'audio', label: 'Music only' }, { value: 'audio-and-video', label: 'Music and video' }], value: 'audio' }] }],
    ]);
  });

  it.each([
    ['runSongAction', { vaultSongId: 'song_7', action: 'delete-everything' }],
    ['runSongAction', { vaultSongId: 42, action: 'sync' }],
    ['setLayout', 'C:\\Windows'],
    ['setBackgroundSync', 'yes'],
    ['useFoundGame', 'x'.repeat(5_000)],
    ['installAddon', null],
    ['installAddon', { address: 'https://tapes.example.org', name: 'Indie Tapes', version: '1.0.0', author: 'hyperpad' }],
    ['installAddon', { address: 'https://tapes.example.org', name: 'Indie Tapes', version: '1.0.0', author: 'hyperpad', options: Array.from({ length: 9 }, () => ({})) }],
    ['setAddonOption', { addonId: 'indie.tapes', optionId: 'media', value: 42 }],
    ['setAddonOption', 'media=audio'],
    ['removeMusicFolder', { path: 'C:\\' }],
  ] as const)('refuses %s with %j before it reaches the controller', async (methodName, argument) => {
    const { controller, calls } = buildRecordingController();
    const handlers = buildBridgeHandlers(controller);
    await expect(Promise.resolve().then(() => handlers[methodName](argument))).rejects.toThrow(InvalidBridgeArgumentError);
    expect(calls).toEqual([]);
  });
});
