import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Rules tests live under tests/rules and need the emulator, so the default
    // run is scoped to src. Run rules tests via `npm run test:rules` only.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
