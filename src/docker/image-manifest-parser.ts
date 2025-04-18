import { getErrorMessage } from '../errors';

/** Type guard for validating sha256 digests */
const isValidDigest = (digest: unknown): digest is string => typeof digest === 'string' && digest.startsWith('sha256:');

/** Platform details within manifest entries */
export type PlatformInfo = {
  readonly architecture?: string;
  readonly os?: string;
  readonly variant?: string;
};

/** Type guard for validating PlatformInfo structure */
function isPlatformInfo(p: unknown): p is PlatformInfo {
  if (typeof p !== 'object' || p === null) return false;
  const platform = p as PlatformInfo;
  const archOk = !('architecture' in platform) || typeof platform.architecture === 'string';
  const osOk = !('os' in platform) || typeof platform.os === 'string';
  const variantOk = !('variant' in platform) || typeof platform.variant === 'string';
  return archOk && osOk && variantOk;
}

/** Entry in a manifest list */
export type ManifestListEntry = {
  readonly digest: string;
  readonly platform?: PlatformInfo;
};

/** Type guard for validating ManifestListEntry structure */
function isManifestListEntry(entry: unknown): entry is ManifestListEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  if (!('digest' in entry) || !isValidDigest(entry.digest)) return false;
  if ('platform' in entry && entry.platform !== undefined && !isPlatformInfo(entry.platform)) return false;
  return true;
}

/** Multi-platform image manifest (OCI index) */
export type MultiPlatformImageManifest = {
  readonly mediaType: string;
  readonly manifests: readonly ManifestListEntry[];
  readonly digest?: string;
};

/** Single-platform image manifest */
export type SinglePlatformImageManifest = {
  readonly mediaType: string;
  readonly digest: string;
};

/** Union type representing both manifest structures */
export type ImageManifest = MultiPlatformImageManifest | SinglePlatformImageManifest;

/**
 * Type guard to differentiate between manifest types
 * @param manifest Manifest to check
 * @returns True if manifest is a multi-platform manifest
 */
export function isMultiPlatformManifest(manifest: ImageManifest): manifest is MultiPlatformImageManifest {
  return Array.isArray((manifest as MultiPlatformImageManifest).manifests);
}

/**
 * Parser for Docker image manifests
 */
export class ImageManifestParser {
  /**
   * Parse JSON output from docker inspect command
   * @param jsonString JSON string from Docker manifest inspection
   * @returns Typed ImageManifest object (single or multi-platform)
   * @throws Error when parsing fails or structure is invalid
   */
  parse(jsonString: string): ImageManifest {
    // Use try-catch with immediate assignment to a constant instead of let
    try {
      const parsedData: unknown = JSON.parse(jsonString);

      if (typeof parsedData !== 'object' || parsedData === null) {
        throw new Error('Parsed data is not an object.');
      }

      if (!('mediaType' in parsedData) || typeof parsedData.mediaType !== 'string') {
        throw new Error('Parsed JSON lacks required top-level "mediaType" string.');
      }

      if ('manifests' in parsedData && Array.isArray(parsedData.manifests)) {
        if (!parsedData.manifests.every(isManifestListEntry)) {
          throw new Error('Parsed JSON has invalid structure within "manifests" array.');
        }
        return parsedData as MultiPlatformImageManifest;
      } else if ('digest' in parsedData && isValidDigest(parsedData.digest)) {
        return parsedData as SinglePlatformImageManifest;
      }

      throw new Error('Parsed JSON does not match expected single or multi-platform manifest structure.');
    } catch (error: unknown) {
      throw new Error(`Failed to parse input as JSON: ${getErrorMessage(error)}`);
    }
  }
}
