module.exports = {
  // Use ts-jest preset for base configuration (includes transformer)
  preset: 'ts-jest',
  // Specify the environment Jest will run tests in
  testEnvironment: 'node',
  // Automatically clear mock calls, instances and results before every test
  clearMocks: true,
  // Configure the transformer explicitly to pass options like tsconfig path
  transform: {
    // Use ts-jest for any .ts or .tsx file
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // ts-jest specific options go here
        tsconfig: 'tsconfig.eslint.json', // Point ts-jest to the ESLint/Test tsconfig
      },
    ],
  },
};
