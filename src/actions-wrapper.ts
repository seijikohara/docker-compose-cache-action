/**
 * Wrapper module for GitHub Actions libraries.
 * Makes it easier to mock these dependencies in tests.
 */
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as exec from '@actions/exec';

/**
 * Wrapper for @actions/core functionality
 */
export const actionCore = {
  /**
   * Gets the input value for the given input name
   * @param name - Input name to get
   * @param options - Additional options
   * @returns Input value
   */
  getInput: (name: string, options?: core.InputOptions): string => {
    return core.getInput(name, options);
  },

  /**
   * Gets the multiline input value for the given input name
   * @param name - Input name to get
   * @param options - Additional options
   * @returns Array of input values, one per line
   */
  getMultilineInput: (name: string, options?: core.InputOptions): string[] => {
    return core.getMultilineInput(name, options);
  },

  /**
   * Gets the input value for the given input name as a boolean
   * @param name - Input name to get
   * @param options - Additional options
   * @returns Boolean input value
   */
  getBooleanInput: (name: string, options?: core.InputOptions): boolean => {
    return core.getBooleanInput(name, options);
  },

  /**
   * Sets a value for the outputs of the action
   * @param name - Output name
   * @param value - Output value
   */
  setOutput: (name: string, value: string): void => {
    core.setOutput(name, value);
  },

  /**
   * Logs an info message to the action output
   * @param message - Info message
   */
  info: (message: string): void => {
    core.info(message);
  },

  /**
   * Logs a warning message to the action output
   * @param message - Warning message
   */
  warning: (message: string): void => {
    core.warning(message);
  },

  /**
   * Logs a debug message to the action output
   * @param message - Debug message
   */
  debug: (message: string): void => {
    core.debug(message);
  },

  /**
   * Sets the action as failed with the given message
   * @param message - Error message
   */
  setFailed: (message: string | Error): void => {
    core.setFailed(message);
  },
};

/**
 * Wrapper for @actions/cache functionality
 */
export const actionCache = {
  /**
   * Restores cache from the provided paths
   * @param paths - Paths to restore cache
   * @param primaryKey - Primary cache key
   * @param restoreKeys - Additional restore keys
   * @returns Cache hit key if found, undefined otherwise
   */
  restoreCache: async (paths: string[], primaryKey: string, restoreKeys?: string[]): Promise<string | undefined> => {
    return cache.restoreCache(paths, primaryKey, restoreKeys);
  },

  /**
   * Saves cache from the provided paths
   * @param paths - Paths to save cache
   * @param key - Cache key
   * @returns Cache ID, -1 if cache was already up-to-date
   */
  saveCache: async (paths: string[], key: string): Promise<number> => {
    return cache.saveCache(paths, key);
  },
};

/**
 * Options for executing a command
 */
export type ExecOptions = exec.ExecOptions;

/**
 * Wrapper for @actions/exec functionality
 */
export const actionExec = {
  /**
   * Executes a command in a shell
   * @param commandLine - Command to execute
   * @param args - Arguments to pass to the command
   * @param options - Options for executing the command
   * @returns Exit code
   */
  exec: async (commandLine: string, args?: string[], options?: ExecOptions): Promise<number> => {
    return exec.exec(commandLine, args, options);
  },
};
