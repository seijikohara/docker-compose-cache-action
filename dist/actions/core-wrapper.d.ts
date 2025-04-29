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
export declare function getInput(name: string, options?: core.InputOptions): string;
/**
 * Gets the multiline input value for the given input name
 *
 * @param name - Name of the multiline input to get
 * @param options - Optional input options
 * @returns Array of strings, one for each line of the input
 */
export declare function getMultilineInput(name: string, options?: core.InputOptions): string[];
/**
 * Gets the input value for the given input name as a boolean
 *
 * @param name - Name of the boolean input to get
 * @param options - Optional input options
 * @returns Boolean value of the input
 */
export declare function getBooleanInput(name: string, options?: core.InputOptions): boolean;
/**
 * Sets a value for the outputs of the action
 *
 * @param name - Name of the output to set
 * @param value - Value to set for the output
 */
export declare function setOutput(name: string, value: string): void;
/**
 * Logs an info message to the action output
 *
 * @param message - Message to log at info level
 */
export declare function info(message: string): void;
/**
 * Logs a warning message to the action output
 *
 * @param message - Message to log at warning level
 */
export declare function warning(message: string): void;
/**
 * Logs a debug message to the action output
 * Requires the workflow to have debug logging enabled
 *
 * @param message - Message to log at debug level
 */
export declare function debug(message: string): void;
/**
 * Sets the action as failed with the given message
 *
 * @param message - Error message or Error object
 */
export declare function setFailed(message: string | Error): void;
/**
 * Gets access to the workflow summary functionality
 * Used to create a Markdown summary for the workflow
 */
export declare const summary: typeof core.summary;
