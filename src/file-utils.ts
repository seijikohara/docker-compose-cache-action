/**
 * @fileoverview File and path utility functions.
 * Provides utilities for path sanitization and file size formatting.
 */

/**
 * File size formatting units.
 */
const FILE_SIZE_UNITS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * File size calculation base.
 */
const FILE_SIZE_BASE = 1024;

/**
 * Sanitizes a string to make it safe for use in file paths.
 *
 * @param value - The string to sanitize.
 * @returns A sanitized string safe for use in file paths.
 */
export function sanitizePathComponent(value: string): string {
  // Replace all characters that are not safe for filenames across platforms
  // This includes: / \ : * ? " < > |
  return value.replace(/[/\\:*?"<>|]/g, '-');
}

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param sizeInBytes - Size in bytes.
 * @returns Human-readable size string (e.g. "10.5 MB").
 */
export function formatFileSize(sizeInBytes: number | undefined): string {
  if (sizeInBytes === undefined) {
    return 'N/A';
  }

  if (sizeInBytes === 0) {
    return '0 Bytes';
  }

  const i = Math.floor(Math.log(sizeInBytes) / Math.log(FILE_SIZE_BASE));
  const unitIndex = Math.min(i, FILE_SIZE_UNITS.length - 1);
  const unit = FILE_SIZE_UNITS[unitIndex as keyof typeof FILE_SIZE_UNITS] || FILE_SIZE_UNITS[0];

  return `${(sizeInBytes / Math.pow(FILE_SIZE_BASE, unitIndex)).toFixed(2).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1')} ${unit}`;
}
