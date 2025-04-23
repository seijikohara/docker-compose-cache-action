import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { actionCore } from './actions-wrapper';

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
 * Gets Docker Compose services from compose files, filtering out excluded images
 * @param composeFilePaths - Array of compose file paths
 * @param excludeImageNames - Array of image names to exclude
 * @returns Array of ComposeService objects with image definitions
 */
export function getComposeServicesFromFiles(
  composeFilePaths: ReadonlyArray<string>,
  excludeImageNames: ReadonlyArray<string>
): ReadonlyArray<ComposeService> {
  // Convert excludeImageNames to a set for O(1) lookups
  const excludedImages: ReadonlySet<string> = new Set(excludeImageNames);

  // Use default files if none provided
  const filesToProcess: ReadonlyArray<string> =
    composeFilePaths.length > 0
      ? composeFilePaths.filter((file) => fs.existsSync(file))
      : DEFAULT_COMPOSE_FILE_NAMES.filter((file) => fs.existsSync(file));

  // Extract and filter services from all files
  return filesToProcess
    .flatMap((file) => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const parsed = yaml.load(content) as ComposeFile | null;

        // Early return for empty or invalid YAML files
        if (!parsed) {
          actionCore.debug(`Empty or invalid YAML file: ${file}`);
          return [];
        }

        // Early return if services section doesn't exist
        if (!parsed.services) {
          actionCore.debug(`No services section found in ${file}`);
          return [];
        }

        return Object.values(parsed.services);
      } catch (error) {
        actionCore.warning(`Failed to parse ${file}: ${error}`);
        return [];
      }
    })
    .filter(
      (service) =>
        // Keep only services with defined images that aren't excluded
        service.image !== undefined && !excludedImages.has(service.image)
    );
}
