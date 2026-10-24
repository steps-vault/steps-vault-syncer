import { describe, expect, it } from 'vitest';
import { buildPlayerSsc, InvalidSscError } from './player-ssc';

const SONG_SSC = [
  '#VERSION:0.83;',
  '#TITLE:Cheap Thrills;',
  '#MUSIC:Cheap Thrills.ogg;',
  '#SAMPLESTART:45.000000;',
  '#SAMPLELENGTH:12.000000;',
  '#OFFSET:-0.120000;',
  '#BPMS:0.000=90.000;',
  '#BGCHANGES:-0.180=video.mp4=1.000=0=0=1,',
  '99999=-nosongbg-=1.000=0=0=0;',
  '#NOTEDATA:;',
  '#DIFFICULTY:Hard;',
  '#OFFSET:-0.120000;',
  '#NOTES:',
  '0000',
  ';',
  '',
].join('\n');

describe('buildPlayerSsc', () => {
  it('moves every #OFFSET earlier and the sample later by the shift, and names the player music', () => {
    const playerSsc = buildPlayerSsc({ sscText: SONG_SSC, musicFileName: 'music.ogg', shiftSeconds: 0.18 });
    expect(playerSsc.match(/^#OFFSET:[^;]*;/gm)).toEqual(['#OFFSET:-0.300000;', '#OFFSET:-0.300000;']);
    expect(playerSsc).toContain('#SAMPLESTART:45.180000;');
    expect(playerSsc).toContain('#MUSIC:music.ogg;');
  });

  it('handles music that starts earlier in the player copy', () => {
    const playerSsc = buildPlayerSsc({ sscText: SONG_SSC, musicFileName: 'music.ogg', shiftSeconds: -0.5 });
    expect(playerSsc).toContain('#OFFSET:0.380000;');
    expect(playerSsc).toContain('#SAMPLESTART:44.500000;');
  });

  it('drops the background video, which a synced song does not have, and keeps everything else as it was', () => {
    const playerSsc = buildPlayerSsc({ sscText: SONG_SSC, musicFileName: 'music.ogg', shiftSeconds: 0 });
    expect(playerSsc).not.toContain('#BGCHANGES');
    expect(playerSsc).toContain('#BPMS:0.000=90.000;\n#NOTEDATA:;');
    expect(playerSsc).toContain('#NOTES:\n0000\n;');
  });

  it('keeps Windows line endings', () => {
    const playerSsc = buildPlayerSsc({ sscText: SONG_SSC.replaceAll('\n', '\r\n'), musicFileName: 'music.ogg', shiftSeconds: 0.18 });
    expect(playerSsc).toContain('#OFFSET:-0.300000;\r\n#BPMS');
    expect(playerSsc.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('refuses a song file without #OFFSET, a broken time and an unsafe music name', () => {
    expect(() => buildPlayerSsc({ sscText: '#TITLE:x;\n', musicFileName: 'music.ogg', shiftSeconds: 0 })).toThrow(InvalidSscError);
    expect(() => buildPlayerSsc({ sscText: '#OFFSET:abc;\n', musicFileName: 'music.ogg', shiftSeconds: 0 })).toThrow(InvalidSscError);
    expect(() => buildPlayerSsc({ sscText: SONG_SSC, musicFileName: 'my;song.ogg', shiftSeconds: 0 })).toThrow(InvalidSscError);
  });
});
