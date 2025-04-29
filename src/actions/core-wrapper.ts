/**
 * Wrapper module for GitHub Actions core library.
 * Provides simplified access to GitHub Actions core functionality for logging, inputs and outputs.
 */
import * as core from '@actions/core';

/**
 * Gets the input value for the given input name
 *
 * @param name - Name of the input to get
 * @param options - Optional input options
 * @returns String value of the input
 */
export function getInput(name: string, options?: core.InputOptions): string {
  return core.getInput(name, options);
}

/**
 * Gets the multiline input value for the given input name
 *
 * @param name - Name of the multiline input to get
 * @param options - Optional input options
 * @returns Array of strings, one for each line of the input
 */
export function getMultilineInput(name: string, options?: core.InputOptions): string[] {
  return core.getMultilineInput(name, options);
}

/**
 * Gets the input value for the given input name as a boolean
 *
 * @param name - Name of the boolean input to get
 * @param options - Optional input options
 * @returns Boolean value of the input
 */
export function getBooleanInput(name: string, options?: core.InputOptions): boolean {
  return core.getBooleanInput(name, options);
}

/**
 * Sets a value for the outputs of the action
 *
 * @param name - Name of the output to set
 * @param value - Value to set for the output
 */
export function setOutput(name: string, value: string): void {
  core.setOutput(name, value);
}

/**
 * Logs an info message to the action output
 *
 * @param message - Message to log at info level
 */
export function info(message: string): void {
  core.info(message);
}

/**
 * Logs a warning message to the action output
 *
 * @param message - Message to log at warning level
 */
export function warning(message: string): void {
  core.warning(message);
}

/**
 * Logs a debug message to the action output
 * Requires the workflow to have debug logging enabled
 *
 * @param message - Message to log at debug level
 */
export function debug(message: string): void {
  core.debug(message);
}

/**
 * Sets the action as failed with the given message
 *
 * @param message - Error message or Error object
 */
export function setFailed(message: string | Error): void {
  core.setFailed(message);
}

/**
 * Gets access to the workflow summary functionality
 * Used to create a Markdown summary for the workflow
 */
export const summary: typeof core.summary = core.summary;
