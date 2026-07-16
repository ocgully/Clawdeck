import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

// Native/runtime deps must stay external — they can't be bundled.
const external = [/^@elgato-stream-deck/, "sharp", "node-hid", /^node:/];

export default {
  input: "scripts/proof-of-life.ts",
  output: { file: ".pol/pol.mjs", format: "esm" },
  external,
  plugins: [
    typescript({
      tsconfig: false,
      compilerOptions: {
        module: "ESNext",
        target: "ES2022",
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        strict: false,
        skipLibCheck: true,
      },
    }),
    nodeResolve({ exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
  ],
};
