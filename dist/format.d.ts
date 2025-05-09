/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param sizeInBytes - Size in bytes.
 * @returns Human-readable size string (e.g. "10.5 MB").
 */
export declare function formatFileSize(sizeInBytes: number | undefined): string;
/**
 * Formats the time difference between start and end timestamps into a human-readable duration string.
 *
 * @param startTime - Start timestamp in milliseconds.
 * @param endTime - End timestamp in milliseconds.
 * @returns Human-readable duration string (e.g. "1 hour 2 minutes 3 seconds").
 */
export declare function formatExecutionTime(startTime: number, endTime: number): string;
