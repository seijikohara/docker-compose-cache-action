/**
 * Safely extracts an error message from an unknown type.
 * @param error - The error object or value caught.
 * @returns A string representation of the error message.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}
