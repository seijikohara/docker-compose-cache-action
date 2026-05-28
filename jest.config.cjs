/** @type {import('jest').Config} */
module.exports = {
  // True ESM mode for tests so that ESM-only dependencies
  // (e.g. @actions/cache@6, @actions/core@3, @actions/exec@3) can be
  // imported. Tests must use `jest.unstable_mockModule()` + dynamic
  // `await import(...)` instead of the auto-hoisted `jest.mock()` to
  // intercept the module graph under ESM. Invoke jest with
  // `NODE_OPTIONS=--experimental-vm-modules` via the `test` script.
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  clearMocks: true,
  extensionsToTreatAsEsm: ['.ts'],
  // NodeNext requires explicit `.js` specifiers on relative imports.
  // Jest needs to resolve those back to the `.ts` source files at
  // test time.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.json',
      },
    ],
  },
};
