/**
 * Wrapper module for GitHub Actions exec library.
 * Provides simplified access to command execution functionality.
 */
import * as exec from '@actions/exec';
/**
 * Options for executing a command
 * Includes configurations for working directory, environment variables,
 * input/output handling, and error behavior.
 */
export type ExecOptions = exec.ExecOptions;
/**
 * Executes a command in a shell
 *
 * @param commandLine - The command to execute
 * @param args - Optional arguments for the command
 * @param options - Optional execution options
 * @returns Promise that resolves to the exit code
 */
export declare function execCommand(commandLine: string, args?: string[], options?: ExecOptions): Promise<number>;
