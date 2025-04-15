import * as core from '@actions/core';
import { ActionRunner } from './action-runner';

async function main(): Promise<void> {
  try {
    const runner = new ActionRunner();
    await runner.run();
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred.');
    }
  }
}

void main();
