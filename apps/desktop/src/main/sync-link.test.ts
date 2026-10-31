import { describe, expect, it } from 'vitest';
import { findSyncLinkInArguments, getMakeSongLinkOrNull } from './sync-link';

const MAKE_SONG_ADDRESS = 'dancedance-sync://generators/make';

function buildLink(parameters: Record<string, string>): string {
  return `${MAKE_SONG_ADDRESS}?${new URLSearchParams(parameters).toString()}`;
}

describe('getMakeSongLinkOrNull', () => {
  it('reads the song, the Wanted request and the party list', () => {
    expect(getMakeSongLinkOrNull(buildLink({ title: 'Neon Rain', artist: 'Kaito & Mio', wanted: 'wanted_7', party: 'noas-dance-night-7q2xk' }))).toEqual({
      title: 'Neon Rain', artist: 'Kaito & Mio', siteRequest: { wantedRequestId: 'wanted_7', partySlug: 'noas-dance-night-7q2xk' },
    });
  });

  it('needs only the title, and keeps titles in any script', () => {
    expect(getMakeSongLinkOrNull(buildLink({ title: 'בלב הסערה' }))).toEqual({ title: 'בלב הסערה', artist: null, siteRequest: null });
    expect(getMakeSongLinkOrNull(buildLink({ title: '夜明けのビート', artist: 'さくらループ', party: 'מסיבה-7q2xk' }))).toEqual({ title: '夜明けのビート', artist: 'さくらループ', siteRequest: { wantedRequestId: null, partySlug: 'מסיבה-7q2xk' } });
  });

  it('accepts what browsers and Windows do to the address: a trailing slash, an upper-case scheme or host, spaces as +', () => {
    expect(getMakeSongLinkOrNull('dancedance-sync://generators/make/?title=Neon+Rain')?.title).toBe('Neon Rain');
    expect(getMakeSongLinkOrNull('DanceDance-Sync://Generators/make?title=Neon%20Rain')?.title).toBe('Neon Rain');
  });

  it('tidies spaces in the song’s name', () => {
    expect(getMakeSongLinkOrNull(buildLink({ title: '  Neon \n\t Rain ', artist: '   ' }))).toEqual({ title: 'Neon Rain', artist: null, siteRequest: null });
  });

  it.each([
    ['another scheme', 'https://generators/make?title=Neon'],
    ['another route', 'dancedance-sync://songs/make?title=Neon'],
    ['another page', 'dancedance-sync://generators/remove?title=Neon'],
    ['a deeper page', 'dancedance-sync://generators/make/now?title=Neon'],
    ['no host', 'dancedance-sync:generators/make?title=Neon'],
    ['a user name', 'dancedance-sync://player:secret@generators/make?title=Neon'],
    ['a port', 'dancedance-sync://generators:8080/make?title=Neon'],
    ['an encoded host', 'dancedance-sync://gen%65rators/make?title=Neon'],
    ['no title', `${MAKE_SONG_ADDRESS}?artist=Kaito`],
    ['an empty title', `${MAKE_SONG_ADDRESS}?title=%20%20`],
    ['two titles', `${MAKE_SONG_ADDRESS}?title=Neon&title=Other`],
    ['a title that is too long', buildLink({ title: 'a'.repeat(201) })],
    ['a link that is too long', buildLink({ title: 'Neon', note: 'a'.repeat(3_000) })],
    ['a control character in the title', `${MAKE_SONG_ADDRESS}?title=Neon%00Rain`],
    ['text-direction tricks in the title', `${MAKE_SONG_ADDRESS}?title=Neon%E2%80%AEniaR`],
    ['not a link at all', 'not a link'],
    ['an empty text', ''],
  ])('ignores a link with %s', (_case, link) => {
    expect(getMakeSongLinkOrNull(link)).toBeNull();
  });

  it('drops an artist, Wanted id or party slug that breaks its rules, and ignores parts it doesn’t know', () => {
    const link = buildLink({ title: 'Neon Rain', artist: 'x'.repeat(201), wanted: '../../etc/passwd', party: '<script>', musicPath: 'C:\\Windows\\System32', generator: 'https://evil.example' });
    expect(getMakeSongLinkOrNull(link)).toEqual({ title: 'Neon Rain', artist: null, siteRequest: null });
    expect(getMakeSongLinkOrNull(buildLink({ title: 'Neon', wanted: 'w'.repeat(65), party: 'p'.repeat(81) }))?.siteRequest).toBeNull();
    expect(getMakeSongLinkOrNull(`${MAKE_SONG_ADDRESS}?title=Neon&wanted=a&wanted=b&party=ok-party`)?.siteRequest).toEqual({ wantedRequestId: null, partySlug: 'ok-party' });
  });
});

describe('findSyncLinkInArguments', () => {
  it('finds the link among the arguments Windows starts the app with', () => {
    const link = buildLink({ title: 'Neon Rain' });
    expect(findSyncLinkInArguments(['C:\\Apps\\DanceDance Sync.exe', '--allow-file-access-from-files', link])).toBe(link);
    expect(findSyncLinkInArguments(['electron.exe', '.', 'DANCEDANCE-SYNC://generators/make?title=Neon'])).toBe('DANCEDANCE-SYNC://generators/make?title=Neon');
  });

  it('finds nothing in an ordinary start', () => {
    expect(findSyncLinkInArguments(['C:\\Apps\\DanceDance Sync.exe', '--hidden'])).toBeNull();
    expect(findSyncLinkInArguments([])).toBeNull();
  });
});
