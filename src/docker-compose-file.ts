/**
 * @fileoverview Docker Compose file parsing and service extraction utilities.
 * Handles reading, parsing, and filtering of Docker Compose services.
 */

import * as core from '@actions/core';
import * as fs from 'fs';
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
 * Extracts Docker Compose services from specified files and filters them based on exclusion list.
 * Removes duplicate services (same image and platform).
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse. Each file is read and parsed as YAML.
 * @param excludedImageNames - Array of image names to exclude from results. Services with these image names are filtered out.
 * @returns Array of unique ComposeService objects from all valid files (duplicates by image+platform are removed).
 */
export function getComposeServicesFromFiles(
  composeFilePaths: ReadonlyArray<string>,
  excludedImageNames: ReadonlyArray<string>
): ReadonlyArray<ComposeService> {
  const excludedImageLookup: ReadonlySet<string> = new Set(excludedImageNames);

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
    .filter((composeService) => composeService.image !== undefined && !excludedImageLookup.has(composeService.image))
    .uniqBy((composeService) => `${composeService.image}|${composeService.platform ?? ''}`)
    .value();
}
