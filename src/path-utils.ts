/**
 * Sanitizes a string to make it safe for use in file paths
 *
 * @param value - The string to sanitize
 * @returns A sanitized string safe for use in file paths
 */
export function sanitizePathComponent(value: string): string {
  // Replace all characters that are not safe for filenames across platforms
  // This includes: / \ : * ? " < > |
  return value.replace(/[/\\:*?"<>|]/g, '-');
}
