import type { ServiceName } from '../network/service-address';
import { parseAddonOptions, type AddonOption } from './addon-options';

const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9.-]{1,63}$/;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 60;
const MAX_VERSION_LENGTH = 32;
const MAX_DESCRIPTION_LENGTH = 300;

/** The part of a manifest that addons and generators share, under the same rules (see addons.md). */
export interface ManifestIdentity {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  /** Simple settings the player picks in Sync (an empty list when there are none). See addon-options.ts. */
  options: readonly AddonOption[];
}

export type ManifestIdentityResult = { kind: 'valid'; identity: ManifestIdentity } | { kind: 'invalid'; problem: string };

/** Returns the problem as a sentence instead of throwing, so each protocol can throw its own error type. */
export function parseManifestIdentity({ manifest, serviceName }: { manifest: Readonly<Record<string, unknown>>; serviceName: ServiceName }): ManifestIdentityResult {
  const id = getTrimmedText({ value: manifest.id, maxLength: MAX_ID_LENGTH });
  if (!SERVICE_ID_PATTERN.test(id)) return { kind: 'invalid', problem: `This ${serviceName}’s manifest has no valid id. Ask its maker to fix it.` };
  const name = getTrimmedText({ value: manifest.name, maxLength: MAX_NAME_LENGTH });
  const version = getTrimmedText({ value: manifest.version, maxLength: MAX_VERSION_LENGTH });
  const author = getTrimmedText({ value: manifest.author, maxLength: MAX_NAME_LENGTH });
  if (name === '' || version === '' || author === '') return { kind: 'invalid', problem: `This ${serviceName}’s manifest is missing its name, version or author. Ask its maker to fix it.` };
  const description = getTrimmedText({ value: manifest.description, maxLength: MAX_DESCRIPTION_LENGTH });
  return { kind: 'valid', identity: { id, name, version, author, description, options: parseAddonOptions(manifest.options) } };
}

function getTrimmedText({ value, maxLength }: { value: unknown; maxLength: number }): string {
  return (typeof value === 'string' ? value.trim() : '').slice(0, maxLength);
}
