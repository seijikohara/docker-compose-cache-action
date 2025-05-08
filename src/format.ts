import { formatDuration, intervalToDuration } from 'date-fns';

/**
 * Formats a file size in bytes to a human-readable string
 *
 * @param sizeInBytes - Size in bytes
 * @returns Human-readable size string (e.g. "10.5 MB")
 */
export function formatFileSize(sizeInBytes: number | undefined): string {
  if (sizeInBytes === undefined) {
    return 'N/A';
  }

  if (sizeInBytes === 0) {
    return '0 Bytes';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  const i = Math.floor(Math.log(sizeInBytes) / Math.log(1024));

  // Ensure we don't exceed the units array bounds
  const unitIndex = Math.min(i, units.length - 1);

  // Format with 2 decimal places and trim trailing zeros
  // Use array access with validation to prevent ESLint warning
  const unit = units[unitIndex as keyof typeof units] || units[0];

  return `${(sizeInBytes / Math.pow(1024, unitIndex)).toFixed(2).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1')} ${unit}`;
}

/**
 * Formats the time difference between start and end timestamps into a human-readable duration string
 *
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @returns Human-readable duration string (e.g. "1 hour 2 minutes 3 seconds")
 */
export function formatExecutionTime(startTime: number, endTime: number): string {
  const duration = intervalToDuration({
    start: 0,
    end: endTime - startTime,
  });

  return formatDuration(duration, {
    format: ['hours', 'minutes', 'seconds'],
    zero: false,
    delimiter: ' ',
  });
}
