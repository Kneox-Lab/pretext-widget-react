import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  // External React so consumers' bundlers wire the right copy. Listed
  // as a peerDependency in package.json — host app provides React.
  external: ["react"],
  // The "use client" directive lives in src/index.tsx and tsup
  // preserves it through the build. Don't add a banner here, or it
  // gets emitted twice (harmless but ugly in the output).
  // Don't minify — small enough that readability + good stack traces
  // win over a few hundred bytes saved.
  minify: false,
});
