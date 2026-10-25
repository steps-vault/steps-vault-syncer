/** Every chart starts with this tag; what comes before the first one is the song's own header. */
const CHART_START_PATTERN = /^#NOTEDATA:/gm;
const NOTES_TAG_PATTERN = /^#NOTES2?:/m;
const BYTE_ORDER_MARK = '﻿';

/** One `#NOTEDATA` block: a chart, with its text kept byte for byte. */
export interface SscChart {
  /** Like `dance-single`; empty when the block has none. */
  stepsType: string;
  /** Like `Hard`; empty when the block has none. */
  difficulty: string;
  hasNotes: boolean;
  text: string;
}

/** A song file split into the song's header and its charts, so charts can be dropped without touching the rest. */
export interface SscFile {
  headerText: string;
  charts: SscChart[];
}

/**
 * Reads a StepMania 5 song file the way Sync writes and edits them: every tag starts a line. Tags written mid-line
 * are not seen, so a file that hides its tags that way is refused by the checks rather than half-understood.
 */
export function readSscFile(text: string): SscFile {
  const sscText = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text;
  const chartStarts = [...sscText.matchAll(CHART_START_PATTERN)].map((match) => match.index);
  const headerText = sscText.slice(0, chartStarts[0] ?? sscText.length);
  const charts = chartStarts.map((start, index) => readSscChart(sscText.slice(start, chartStarts[index + 1] ?? sscText.length)));
  return { headerText, charts };
}

/** The trimmed value of the first `#<tagName>:…;` that starts a line; null when there is none. */
export function getSscTagValue({ text, tagName }: { text: string; tagName: string }): string | null {
  const match = buildTagPattern({ tagName, flags: 'm' }).exec(text);
  return match ? (match[1] ?? '').trim() : null;
}

/** Sets every `#<tagName>` in the text to `value`, or adds the tag at the end when there is none. */
export function withSscTag({ text, tagName, value }: { text: string; tagName: string; value: string }): string {
  if (buildTagPattern({ tagName, flags: 'm' }).test(text)) return text.replace(buildTagPattern({ tagName, flags: 'gm' }), () => `#${tagName}:${value};`);
  const lineEnding = getLineEnding(text);
  const isOnNewLine = text === '' || text.endsWith('\n');
  return `${text}${isOnNewLine ? '' : lineEnding}#${tagName}:${value};${lineEnding}`;
}

/** Removes every `#<tagName>` line, value and all. */
export function withoutSscTag({ text, tagName }: { text: string; tagName: string }): string {
  return text.replace(new RegExp(`^#${tagName}:[^;]*;[^\\S\\r\\n]*\\r?\\n?`, 'gm'), '');
}

export function getLineEnding(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function readSscChart(text: string): SscChart {
  return {
    stepsType: getSscTagValue({ text, tagName: 'STEPSTYPE' }) ?? '',
    difficulty: getSscTagValue({ text, tagName: 'DIFFICULTY' }) ?? '',
    hasNotes: NOTES_TAG_PATTERN.test(text),
    text,
  };
}

function buildTagPattern({ tagName, flags }: { tagName: string; flags: string }): RegExp {
  return new RegExp(`^#${tagName}:([^;]*);`, flags);
}
