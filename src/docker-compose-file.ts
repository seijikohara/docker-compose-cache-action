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
 * @param composeFilePaths - Array of paths to Docker Compose files to check. If empty, default file names are used.
 * @returns Array of existing Docker Compose file paths to process.
 */
export function getComposeFilePathsToProcess(composeFilePaths: ReadonlyArray<string>): ReadonlyArray<string> {
  return composeFilePaths.length > 0
    ? composeFilePaths.filter((filePath) => fs.existsSync(filePath))
    : DEFAULT_COMPOSE_FILE_NAMES.filter((fileName) => fs.existsSync(fileName));
}

/**
 * Extracts Docker Compose services from specified files and filters them based on exclusion list.
 * Removes duplicate services (same image and platform).
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse. Each file is read and parsed as YAML.
 * @param excludeImageNames - Array of image names to exclude from results. Services with these image names are filtered out.
 * @returns Array of unique ComposeService objects from all valid files (duplicates by image+platform are removed).
 */
export function getComposeServicesFromFiles(
  composeFilePaths: ReadonlyArray<string>,
  excludeImageNames: ReadonlyArray<string>
): ReadonlyArray<ComposeService> {
  const excludedImageSet: ReadonlySet<string> = new Set(excludeImageNames);

  return chain(composeFilePaths)
    .flatMap((composeFilePath) => {
      try {
        const fileContent = fs.readFileSync(composeFilePath, 'utf8');
        const parsedComposeFile = yaml.load(fileContent) as ComposeFile | undefined;

        if (!parsedComposeFile) {
          core.debug(`Empty or invalid YAML file: ${composeFilePath}`);
          return [];
        }

        if (!parsedComposeFile.services) {
          core.debug(`No services section found in ${composeFilePath}`);
          return [];
        }

        return Object.values(parsedComposeFile.services);
      } catch (parsingError) {
        core.warning(`Failed to parse ${composeFilePath}: ${parsingError}`);
        return [];
      }
    })
    .filter((composeService) => composeService.image !== undefined && !excludedImageSet.has(composeService.image))
    .uniqBy((composeService) => `${composeService.image}|${composeService.platform ?? ''}`)
    .value();
}
