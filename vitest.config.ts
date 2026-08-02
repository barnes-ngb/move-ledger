import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom rather than node, so components can render. Domain tests are
    // environment-agnostic and pass either way. Rules tests are excluded
    // here and run under the emulator via `npm run test:rules`.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    // Testing Library registers its own cleanup only when a global afterEach
    // exists. Without this, a second render in one file stacks on the first
    // and every query finds two of everything. tsconfig.json already lists
    // vitest/globals in types, so this makes the runtime match the types.
    globals: true,
  },
});
