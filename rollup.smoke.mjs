import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "scripts/smoke.ts",
  output: {
    file: ".smoke/smoke.mjs",
    format: "esm",
  },
  plugins: [
    typescript({ tsconfig: false, compilerOptions: { module: "ESNext", target: "ES2022", moduleResolution: "bundler", allowImportingTsExtensions: true, strict: false, skipLibCheck: true } }),
    nodeResolve({ exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
  ],
};
