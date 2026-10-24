const MAX_OPTIONS = 8;
const MIN_CHOICES = 2;
const MAX_CHOICES = 6;
const MAX_OPTION_LABEL_LENGTH = 40;
const OPTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const CHOICE_VALUE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** The one option Sync itself understands: with 'audio' ("Music only") it never downloads the addon's video. */
export const MEDIA_OPTION_ID = 'media';
export const MUSIC_ONLY_MEDIA_VALUE = 'audio';

export interface AddonOptionChoice {
  value: string;
  label: string;
}

/**
 * A setting the player picks from a short list. Only choices, never free text, so an option can't ask the player for
 * personal data.
 */
export interface AddonChoiceOption {
  id: string;
  label: string;
  kind: 'choice';
  choices: readonly AddonOptionChoice[];
  default: string;
}

export type AddonOption = AddonChoiceOption;

/** The player's pick for each option, by option id. */
export type AddonOptionValues = Record<string, string>;

/** Options are a convenience: a broken one is dropped, never a reason to refuse the addon. */
export function parseAddonOptions(value: unknown): AddonOption[] {
  if (!Array.isArray(value)) return [];
  const options: AddonOption[] = [];
  for (const candidate of value) {
    const option = parseAddonOptionOrNull(candidate);
    if (option && !options.some((existing) => existing.id === option.id)) options.push(option);
  }
  return options.slice(0, MAX_OPTIONS);
}

/**
 * The value of every declared option: the saved one when it is still one of the choices, else the default. Saved
 * values for options the addon no longer declares are left out, so they are never sent.
 */
export function getAddonOptionValues({ options, savedValues }: { options: readonly AddonOption[] | undefined; savedValues: Readonly<Record<string, unknown>> | undefined }): AddonOptionValues {
  const values: AddonOptionValues = {};
  for (const option of options ?? []) {
    const savedValue = savedValues?.[option.id];
    values[option.id] = typeof savedValue === 'string' && isChoiceOf({ option, value: savedValue }) ? savedValue : option.default;
  }
  return values;
}

/** Returns the values with one option changed, or the same values when the option or the choice isn't declared. */
export function withAddonOptionValue({ options, values, optionId, value }: { options: readonly AddonOption[] | undefined; values: AddonOptionValues; optionId: string; value: string }): AddonOptionValues {
  const option = options?.find((candidate) => candidate.id === optionId);
  if (!option || !isChoiceOf({ option, value })) return values;
  return { ...values, [optionId]: value };
}

function parseAddonOptionOrNull(value: unknown): AddonOption | null {
  if (!isRecord(value) || value.kind !== 'choice') return null;
  if (typeof value.id !== 'string' || !OPTION_ID_PATTERN.test(value.id)) return null;
  const label = getLabelOrNull(value.label);
  const choices = parseChoicesOrNull(value.choices);
  if (label === null || choices === null) return null;
  if (typeof value.default !== 'string' || !choices.some((choice) => choice.value === value.default)) return null;
  return { id: value.id, label, kind: 'choice', choices, default: value.default };
}

function parseChoicesOrNull(value: unknown): AddonOptionChoice[] | null {
  if (!Array.isArray(value) || value.length < MIN_CHOICES || value.length > MAX_CHOICES) return null;
  const choices = value.map((candidate) => parseChoiceOrNull(candidate));
  if (choices.some((choice) => choice === null)) return null;
  const validChoices = choices as AddonOptionChoice[];
  const hasDuplicateValues = new Set(validChoices.map((choice) => choice.value)).size !== validChoices.length;
  return hasDuplicateValues ? null : validChoices;
}

function parseChoiceOrNull(value: unknown): AddonOptionChoice | null {
  if (!isRecord(value) || typeof value.value !== 'string' || !CHOICE_VALUE_PATTERN.test(value.value)) return null;
  const label = getLabelOrNull(value.label);
  return label === null ? null : { value: value.value, label };
}

function getLabelOrNull(value: unknown): string | null {
  const label = typeof value === 'string' ? value.trim() : '';
  return label === '' ? null : label.slice(0, MAX_OPTION_LABEL_LENGTH);
}

function isChoiceOf({ option, value }: { option: AddonOption; value: string }): boolean {
  return option.choices.some((choice) => choice.value === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
