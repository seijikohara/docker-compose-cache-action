import * as core from '@actions/core';
import * as exec from '@actions/exec';
/**
 * Wrapper for @actions/core functionality
 */
export declare const actionCore: {
    /**
     * Gets the input value for the given input name
     * @param name - Input name to get
     * @param options - Additional options
     * @returns Input value
     */
    getInput: (name: string, options?: core.InputOptions) => string;
    /**
     * Gets the multiline input value for the given input name
     * @param name - Input name to get
     * @param options - Additional options
     * @returns Array of input values, one per line
     */
    getMultilineInput: (name: string, options?: core.InputOptions) => string[];
    /**
     * Gets the input value for the given input name as a boolean
     * @param name - Input name to get
     * @param options - Additional options
     * @returns Boolean input value
     */
    getBooleanInput: (name: string, options?: core.InputOptions) => boolean;
    /**
     * Sets a value for the outputs of the action
     * @param name - Output name
     * @param value - Output value
     */
    setOutput: (name: string, value: string) => void;
    /**
     * Logs an info message to the action output
     * @param message - Info message
     */
    info: (message: string) => void;
    /**
     * Logs a warning message to the action output
     * @param message - Warning message
     */
    warning: (message: string) => void;
    /**
     * Logs a debug message to the action output
     * @param message - Debug message
     */
    debug: (message: string) => void;
    /**
     * Sets the action as failed with the given message
     * @param message - Error message
     */
    setFailed: (message: string | Error) => void;
};
/**
 * Wrapper for @actions/cache functionality
 */
export declare const actionCache: {
    /**
     * Restores cache from the provided paths
     * @param paths - Paths to restore cache
     * @param primaryKey - Primary cache key
     * @param restoreKeys - Additional restore keys
     * @returns Cache hit key if found, undefined otherwise
     */
    restoreCache: (paths: string[], primaryKey: string, restoreKeys?: string[]) => Promise<string | undefined>;
    /**
     * Saves cache from the provided paths
     * @param paths - Paths to save cache
     * @param key - Cache key
     * @returns Cache ID, -1 if cache was already up-to-date
     */
    saveCache: (paths: string[], key: string) => Promise<number>;
};
/**
 * Options for executing a command
 */
export type ExecOptions = exec.ExecOptions;
/**
 * Wrapper for @actions/exec functionality
 */
export declare const actionExec: {
    /**
     * Executes a command in a shell
     * @param commandLine - Command to execute
     * @param args - Arguments to pass to the command
     * @param options - Options for executing the command
     * @returns Exit code
     */
    exec: (commandLine: string, args?: string[], options?: ExecOptions) => Promise<number>;
};
