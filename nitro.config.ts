import { fileURLToPath } from "node:url";
import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  srcDir: "server",
  preset: "node-server",
  compatibilityDate: "2026-06-11",
  alias: {
    "@server": fileURLToPath(new URL("./server", import.meta.url))
  },
  routeRules: {
    "/api/**": {
      cors: true,
      headers: {
        "cache-control": "no-store"
      }
    }
  },
  typescript: {
    strict: true
  }
});
