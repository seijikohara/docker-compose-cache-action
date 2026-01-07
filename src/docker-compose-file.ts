/**
 * @fileoverview Docker Compose file parsing and service extraction utilities.
 * Handles reading, parsing, and filtering of Docker Compose services.
 */

import * as fs from 'node:fs';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { chain } from 'lodash';

/**
 * Represents a Docker Compose service definition with an image reference.
 */
export type ComposeService = {
  readonly image: string;
  readonly platform?: string;
};

/**
 * Represents the structure of a Docker Compose file.
 */
type ComposeFile = {
  readonly services?: Record<string, ComposeService>;
};

/**
 * Default Docker Compose filenames to look for if none are specified.
 */
const DEFAULT_COMPOSE_FILE_NAMES: ReadonlyArray<string> = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
];

/**
 * Converts a glob-style pattern to a regular expression.
 * Supports `*` as a wildcard matching any characters and `?` matching a single character.
 *
 * @param pattern - Glob pattern to convert (e.g., "nginx:*", "*:latest")
 * @returns RegExp object for matching
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except * and ?
    .replace(/\*/g, '.*') // * matches any characters
    .replace(/\?/g, '.'); // ? matches single character
  return new RegExp(`^${escaped}$`);
}

/**
 * Checks if an image name matches any of the exclusion patterns.
 * Supports exact matches and glob-style patterns with `*` and `?` wildcards.
 *
 * @param imageName - The image name to check (e.g., "nginx:latest")
 * @param patterns - Array of patterns to match against (e.g., ["nginx:*", "*:latest"])
 * @returns true if the image matches any pattern, false otherwise
 */
export function matchesExcludePattern(imageName: string, patterns: ReadonlyArray<string>): boolean {
  return patterns.some((pattern) => {
    // Fast path: exact match (no wildcards)
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return imageName === pattern;
    }
    // Glob pattern match
    return patternToRegex(pattern).test(imageName);
  });
}

/**
 * Returns the list of Docker Compose file paths to process, based on input or defaults.
 *
 * @param candidateComposeFilePaths - Array of paths to Docker Compose files to check. If empty, default file names are used.
 * @returns Array of existing Docker Compose file paths to process.
 */
export function getComposeFilePathsToProcess(candidateComposeFilePaths: ReadonlyArray<string>): ReadonlyArray<string> {
  return candidateComposeFilePaths.length > 0
    ? candidateComposeFilePaths.filter((filePath) => fs.existsSync(filePath))
    : DEFAULT_COMPOSE_FILE_NAMES.filter((fileName) => fs.existsSync(fileName));
}

/**
 * Extracts Docker Compose services from specified files and filters them based on exclusion patterns.
 * Removes duplicate services (same image and platform).
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse. Each file is read and parsed as YAML.
 * @param excludedImagePatterns - Array of image patterns to exclude from results. Supports exact matches and glob patterns with `*` and `?`.
 * @returns Array of unique ComposeService objects from all valid files (duplicates by image+platform are removed).
 */
export function getComposeServicesFromFiles(
  composeFilePaths: ReadonlyArray<string>,
  excludedImagePatterns: ReadonlyArray<string>
): ReadonlyArray<ComposeService> {
  return chain(composeFilePaths)
    .flatMap((currentComposeFile) => {
      try {
        const yamlContent = fs.readFileSync(currentComposeFile, 'utf8');
        const composeDefinition = yaml.load(yamlContent) as ComposeFile | undefined;

        if (!composeDefinition) {
          core.debug(`Empty or invalid YAML file: ${currentComposeFile}`);
          return [];
        }

        if (!composeDefinition.services) {
          core.debug(`No services section found in ${currentComposeFile}`);
          return [];
        }

        return Object.values(composeDefinition.services);
      } catch (yamlParsingError) {
        core.warning(`Failed to parse ${currentComposeFile}: ${yamlParsingError}`);
        return [];
      }
    })
    .filter(
      (composeService) =>
        composeService.image !== undefined && !matchesExcludePattern(composeService.image, excludedImagePatterns)
    )
    .uniqBy((composeService) => `${composeService.image}|${composeService.platform ?? ''}`)
    .value();
}
