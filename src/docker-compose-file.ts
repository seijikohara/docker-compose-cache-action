import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

/**
 * Represents a Docker Compose service definition with an image reference
 */
export type ComposeService = {
  readonly image: string;
  readonly platform: string | undefined;
};

/**
 * Represents the structure of a Docker Compose file
 */
type ComposeFile = {
  readonly services: Record<string, ComposeService> | undefined;
};

/**
 * Default Docker Compose filenames to look for if none are specified
 */
const DEFAULT_COMPOSE_FILE_NAMES: ReadonlyArray<string> = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
];

/**
 * Extracts Docker Compose services from specified files and filters them
 * based on exclusion list
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse
 * @param excludeImageNames - Array of image names to exclude from results
 * @returns Array of ComposeService objects from all valid files
 */
export function getComposeServicesFromFiles(
  composeFilePaths: ReadonlyArray<string>,
  excludeImageNames: ReadonlyArray<string>
): ReadonlyArray<ComposeService> {
  // Convert exclude list to a Set for O(1) lookups
  const excludedImageSet: ReadonlySet<string> = new Set(excludeImageNames);

  // Use provided paths or default filenames if none provided
  const composeFilesToProcess: ReadonlyArray<string> =
    composeFilePaths.length > 0
      ? composeFilePaths.filter((filePath) => fs.existsSync(filePath))
      : DEFAULT_COMPOSE_FILE_NAMES.filter((fileName) => fs.existsSync(fileName));

  return (
    composeFilesToProcess
      .flatMap((composeFilePath) => {
        try {
          const fileContent = fs.readFileSync(composeFilePath, 'utf8');
          // Parse YAML content into a ComposeFile structure
          const parsedComposeFile = yaml.load(fileContent) as ComposeFile | undefined;

          if (!parsedComposeFile) {
            core.debug(`Empty or invalid YAML file: ${composeFilePath}`);
            return [];
          }

          if (!parsedComposeFile.services) {
            core.debug(`No services section found in ${composeFilePath}`);
            return [];
          }

          // Return just the service definitions, discarding service names
          return Object.values(parsedComposeFile.services);
        } catch (parsingError) {
          core.warning(`Failed to parse ${composeFilePath}: ${parsingError}`);
          return [];
        }
      })
      // Filter out services with no image property or excluded images
      .filter(
        (serviceDefinition) => serviceDefinition.image !== undefined && !excludedImageSet.has(serviceDefinition.image)
      )
  );
}
