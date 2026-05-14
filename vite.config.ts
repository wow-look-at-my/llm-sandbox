import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"
import path from "path"

export default defineConfig({
  plugins: [
    {
      name: "opencode-sandbox:config",
      config() {
        return {
          resolve: {
            alias: {
              "@": fileURLToPath(new URL("./src", import.meta.url)),
              "@opencode-ai/ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
              "@opencode-ai/core/util/path": fileURLToPath(new URL("./src/lib/utils/path.ts", import.meta.url)),
              "@opencode-ai/core/util/encode": fileURLToPath(new URL("./src/lib/utils/encode.ts", import.meta.url)),
              "@opencode-ai/core/util/binary": fileURLToPath(new URL("./src/lib/utils/binary.ts", import.meta.url)),
              "@opencode-ai/core/util/retry": fileURLToPath(new URL("./src/lib/utils/retry.ts", import.meta.url)),
              "@opencode-ai/core/util/array": fileURLToPath(new URL("./src/lib/utils/array.ts", import.meta.url)),
            },
          },
          worker: {
            format: "es" as const,
          },
        }
      },
    },
    tailwindcss(),
    solidPlugin(),
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
})
