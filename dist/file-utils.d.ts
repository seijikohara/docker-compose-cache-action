/**
 * @fileoverview File and path utility functions.
 * Provides utilities for path sanitization and file size formatting.
 */
/**
 * Sanitizes a string to make it safe for use in file paths.
 *
 * @param value - The string to sanitize.
 * @returns A sanitized string safe for use in file paths.
 */
export declare function sanitizePathComponent(value: string): string;
/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param fileSizeBytes - Size in bytes.
 * @returns Human-readable size string (e.g. "10.5 MB").
 */
export declare function formatFileSize(fileSizeBytes: number | undefined): string;
