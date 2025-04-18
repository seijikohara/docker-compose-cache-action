/**
 * Utility functions for handling errors safely
 */

/**
 * Safely extracts an error message from an unknown caught value.
 * Checks if the value is an Error instance and returns its message,
 * otherwise converts the value to a string.
 * @param error - The value caught in a catch block (type unknown)
 * @returns A string representing the error message
 */
export function getErrorMessage(error: unknown): string {
  // Check if it's an Error object to access message safely
  if (error instanceof Error) {
    return error.message;
  }
  // Otherwise, convert the caught value to a string
  return String(error ?? 'Unknown error'); // Handle null/undefined case
}
