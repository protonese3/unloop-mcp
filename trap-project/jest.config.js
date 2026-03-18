export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "Node16",
          moduleResolution: "Node16",
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
};
