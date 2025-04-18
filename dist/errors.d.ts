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
export declare function getErrorMessage(error: unknown): string;
