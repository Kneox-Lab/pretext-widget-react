import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Bare-bones Vite config. Nothing pretext-specific — the @kneox-lab
// widget package handles its own iframe + script injection at
// runtime, so the host bundler just needs to know how to compile
// React.
export default defineConfig({
  plugins: [react()],
});
