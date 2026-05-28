/** @type {import('jest').Config} */
module.exports = {
  // Hybrid setup: production code is ESM (package.json `"type": "module"`
  // + tsconfig NodeNext), but tests run through ts-jest's default CJS
  // transform. That keeps `jest.mock()` auto-hoisting working — the ESM
  // story for module mocking still requires `jest.unstable_mockModule`
  // + dynamic `await import`, which would be a much larger test
  // rewrite. ts-jest is told to emit CommonJS for the test run via the
  // tsconfig override below, so source-level `.js` import specifiers
  // are still resolved correctly thanks to `moduleNameMapper`.
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          // TS6 deprecated `Node` (= node10); `Node16` is the modern,
          // TS-7-survivable replacement that still maps to Node's
          // CommonJS resolution algorithm when `module: CommonJS` is
          // emitted.
          moduleResolution: 'Node16',
          verbatimModuleSyntax: false,
          esModuleInterop: true,
          target: 'ES2024',
          isolatedModules: true,
        },
        diagnostics: {
          // The same source is type-checked under verbatimModuleSyntax
          // by the production `npm run build`; suppressing the import
          // assertion warnings only affects ts-jest's looser CJS pass.
          ignoreCodes: [],
        },
      },
    ],
  },
};
