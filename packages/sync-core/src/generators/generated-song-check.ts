import { getSscTagValue, readSscFile, type SscChart } from '../ssc/ssc-reader';
import { GeneratorError } from './generator-error';
import type { GeneratorDifficulty } from './generator-protocol';

const PLAYED_STEPS_TYPE = 'dance-single';

/** A generator's song file that passed the checks, cut down to the charts that were asked for. */
export interface CheckedGeneratedSsc {
  headerText: string;
  /** One chart per difficulty asked, in the file's own order. */
  charts: SscChart[];
}

/**
 * "What Sync checks before a song reaches the game": the file has #OFFSET and #BPMS and a dance-single chart for every
 * difficulty asked. Other charts are dropped, so the game shows exactly what the player asked for.
 */
export function checkGeneratedSsc({ chartText, difficulties, generatorName }: { chartText: string; difficulties: readonly GeneratorDifficulty[]; generatorName: string }): CheckedGeneratedSsc {
  const sscFile = readSscFile(chartText);
  if (!hasUsableOffset(sscFile.headerText)) throw new GeneratorError({ reason: 'missing-offset', message: `The song file from ${generatorName} has no #OFFSET, so its steps can’t be lined up with the music; make the song again or ask its maker to fix it.` });
  if (getFirstBpm(sscFile.headerText) === null) throw new GeneratorError({ reason: 'missing-tempo', message: `The song file from ${generatorName} has no usable #BPMS, so Sync can’t time its steps; make the song again or ask its maker to fix it.` });
  const charts = getAskedCharts({ charts: sscFile.charts, difficulties });
  const missingDifficulties = difficulties.filter((difficulty) => !charts.some((chart) => isChartFor({ chart, difficulty })));
  if (missingDifficulties.length > 0) throw buildMissingDifficultyError({ generatorName, missingDifficulties });
  return { headerText: sscFile.headerText, charts };
}

/** The first tempo of `#BPMS:<beat>=<bpm>,…`; null when it is missing or not a positive number. */
export function getFirstBpm(headerText: string): number | null {
  const firstChange = getSscTagValue({ text: headerText, tagName: 'BPMS' })?.split(',')[0] ?? '';
  const bpmText = firstChange.split('=')[1]?.trim() ?? '';
  const bpm = Number(bpmText);
  return bpmText !== '' && Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function hasUsableOffset(headerText: string): boolean {
  const offsetText = getSscTagValue({ text: headerText, tagName: 'OFFSET' }) ?? '';
  return offsetText !== '' && Number.isFinite(Number(offsetText));
}

/** The first playable chart for each difficulty; a second chart of the same difficulty would show up as an edit. */
function getAskedCharts({ charts, difficulties }: { charts: readonly SscChart[]; difficulties: readonly GeneratorDifficulty[] }): SscChart[] {
  const keptCharts = difficulties.flatMap((difficulty) => charts.find((chart) => isChartFor({ chart, difficulty })) ?? []);
  return charts.filter((chart) => keptCharts.includes(chart));
}

function isChartFor({ chart, difficulty }: { chart: SscChart; difficulty: GeneratorDifficulty }): boolean {
  return chart.hasNotes && chart.stepsType.toLowerCase() === PLAYED_STEPS_TYPE && chart.difficulty.toLowerCase() === difficulty.toLowerCase();
}

function buildMissingDifficultyError({ generatorName, missingDifficulties }: { generatorName: string; missingDifficulties: readonly GeneratorDifficulty[] }): GeneratorError {
  const difficultyList = new Intl.ListFormat('en', { type: 'conjunction' }).format(missingDifficulties);
  const chartWord = missingDifficulties.length === 1 ? 'chart' : 'charts';
  return new GeneratorError({ reason: 'missing-difficulty', message: `${generatorName} didn’t make the ${difficultyList} ${PLAYED_STEPS_TYPE} ${chartWord} you asked for, so Sync refused the song; make it again or ask its maker why.` });
}
