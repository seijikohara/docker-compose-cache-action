import * as fs from 'fs';
import * as yaml from 'js-yaml';

import * as coreWrapper from './actions/core-wrapper';

/**
 * Represents a Docker Compose service definition with an image reference
 */
export type ComposeService = {
  readonly image: string;
  readonly platform?: string;
};

/**
 * Represents the structure of a Docker Compose file
 */
type ComposeFile = {
  readonly services?: Record<string, ComposeService>;
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
  const excludedImages: ReadonlySet<string> = new Set(excludeImageNames);

  // Use provided paths or default filenames if none provided
  const filesToProcess: ReadonlyArray<string> =
    composeFilePaths.length > 0
      ? composeFilePaths.filter((file) => fs.existsSync(file))
      : DEFAULT_COMPOSE_FILE_NAMES.filter((file) => fs.existsSync(file));

  return (
    filesToProcess
      .flatMap((file) => {
        try {
          const content = fs.readFileSync(file, 'utf8');
          // Parse YAML content into a ComposeFile structure
          const parsed = yaml.load(content) as ComposeFile | null;

          if (!parsed) {
            coreWrapper.debug(`Empty or invalid YAML file: ${file}`);
            return [];
          }

          if (!parsed.services) {
            coreWrapper.debug(`No services section found in ${file}`);
            return [];
          }

          // Return just the service definitions, discarding service names
          return Object.values(parsed.services);
        } catch (error) {
          coreWrapper.warning(`Failed to parse ${file}: ${error}`);
          return [];
        }
      })
      // Filter out services with no image property or excluded images
      .filter((service) => service.image !== undefined && !excludedImages.has(service.image))
  );
}
