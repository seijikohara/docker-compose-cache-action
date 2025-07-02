/**
 * @fileoverview Date and time utility functions.
 * Provides functions for formatting time durations and calculating execution times.
 */
/**
 * Formats the time difference between start and end timestamps into a human-readable duration string.
 * Uses date-fns to create a natural language representation of the duration.
 *
 * @param startTimestampMs - Start timestamp in milliseconds
 * @param endTimestampMs - End timestamp in milliseconds
 * @returns Human-readable duration string (e.g., "1 hour 2 minutes 3 seconds")
 */
export declare function formatTimeBetween(startTimestampMs: number, endTimestampMs: number): string;
