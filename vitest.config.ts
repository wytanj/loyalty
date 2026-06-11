import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true
  },
  resolve: {
    alias: {
      "@server": fileURLToPath(new URL("./server", import.meta.url)),
      "@headless-loyalty/types": fileURLToPath(
        new URL("./packages/@loyalty-types/src/index.ts", import.meta.url)
      )
    }
  }
});
