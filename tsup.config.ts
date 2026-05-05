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
  // Preserve the "use client" directive at the top of the bundle so
  // Next 13+ App Router consumers don't try to render the component
  // server-side. tsup wraps it correctly when banner is set.
  banner: {
    js: '"use client";',
  },
  // Don't minify — small enough that readability + good stack traces
  // win over a few hundred bytes saved.
  minify: false,
});
