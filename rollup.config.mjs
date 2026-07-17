import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

// Native/runtime deps stay external — they load from node_modules at runtime.
const external = [/^@elgato-stream-deck/, "sharp", "node-hid", "node-mac-permissions", /^node:/];

/** @type {import('rollup').RollupOptions} */
export default {
  input: "src/standalone/main.ts",
  output: {
    file: "dist/clawdeck.mjs",
    format: "esm",
    banner: "#!/usr/bin/env node",
    sourcemap: true,
  },
  external,
  plugins: [
    typescript({
      tsconfig: false,
      compilerOptions: {
        module: "ESNext",
        target: "ES2022",
        moduleResolution: "bundler",
        strict: true,
        skipLibCheck: true,
        sourceMap: true,
      },
    }),
    nodeResolve({ exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
  ],
};
