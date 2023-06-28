import type { Config } from 'jest';
// import { TextEncoder, TextDecoder } from 'util';
import 'websocket-polyfill'

const config: Config = {
  verbose: false,
  moduleFileExtensions: [
    "ts",
    "js"
  ],
  // globals: {
  //   TextDecoder: TextDecoder,
  //   TextEncoder: TextEncoder
  // },
  transform: {
    "^.+\\.(ts?)$": "ts-jest",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules",
    "<rootDir>/dist"
  ],
  testRegex: "(/src/.*(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
  // testEnvironment: "nodejs"
};

export default config;