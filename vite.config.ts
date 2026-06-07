import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"

const srcDir = fileURLToPath(new URL("./src", import.meta.url))
const uiDir = path.join(srcDir, "ui")

function resolveUiImport(importPath: string): string | null {
  const subpath = importPath.replace("@opencode-ai/ui/", "")

  const tryResolve = (candidates: string[]): string | null => {
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
    return null
  }

  if (subpath.startsWith("context/")) {
    const name = subpath.slice("context/".length)
    return tryResolve([
      path.join(uiDir, "context", `${name}.tsx`),
      path.join(uiDir, "context", `${name}.ts`),
      path.join(uiDir, "context", name, "index.tsx"),
      path.join(uiDir, "context", name, "index.ts"),
    ])
  }

  if (subpath === "context") {
    return tryResolve([path.join(uiDir, "context", "index.ts")])
  }

  if (subpath === "hooks") {
    return tryResolve([path.join(uiDir, "hooks", "index.ts")])
  }

  if (subpath.startsWith("theme/")) {
    const name = subpath.slice("theme/".length)
    return tryResolve([
      path.join(uiDir, "theme", `${name}.tsx`),
      path.join(uiDir, "theme", `${name}.ts`),
    ])
  }

  if (subpath === "theme") {
    return tryResolve([path.join(uiDir, "theme", "index.ts")])
  }

  if (subpath.startsWith("i18n/")) {
    const name = subpath.slice("i18n/".length)
    return tryResolve([path.join(uiDir, "i18n", `${name}.ts`)])
  }

  if (subpath.startsWith("pierre/")) {
    const name = subpath.slice("pierre/".length)
    return tryResolve([
      path.join(uiDir, "pierre", `${name}.ts`),
      path.join(uiDir, "pierre", `${name}.tsx`),
    ])
  }

  if (subpath === "pierre") {
    return tryResolve([path.join(uiDir, "pierre", "index.ts")])
  }

  if (subpath.startsWith("styles")) {
    if (subpath === "styles") return tryResolve([path.join(uiDir, "styles", "index.css")])
    if (subpath === "styles/tailwind") return tryResolve([path.join(uiDir, "styles", "tailwind", "index.css")])
  }

  if (subpath.startsWith("icons/")) {
    const name = subpath.slice("icons/".length)
    const mapping: Record<string, string> = {
      provider: "components/provider-icons/types.ts",
      "file-type": "components/file-icons/types.ts",
      app: "components/app-icons/types.ts",
    }
    if (mapping[name]) return path.join(uiDir, mapping[name])
  }

  if (subpath.startsWith("fonts/") || subpath.startsWith("audio/")) {
    return tryResolve([path.join(uiDir, "assets", subpath)])
  }

  return tryResolve([
    path.join(uiDir, "components", `${subpath}.tsx`),
    path.join(uiDir, "components", `${subpath}.ts`),
    path.join(uiDir, "components", subpath, "index.tsx"),
    path.join(uiDir, "components", subpath, "index.ts"),
  ])
}

export default defineConfig({
  plugins: [
    {
      name: "opencode-sandbox:resolve-ui",
      resolveId(source) {
        if (source.startsWith("@opencode-ai/ui/") || source === "@opencode-ai/ui") {
          if (source === "@opencode-ai/ui") {
            return path.join(uiDir, "components", "index.ts")
          }
          const resolved = resolveUiImport(source)
          if (resolved) return resolved
        }
      },
    },
    {
      name: "opencode-sandbox:config",
      config() {
        return {
          resolve: {
            alias: {
              "@": srcDir,
              "@opencode-ai/core/util/path": path.join(srcDir, "lib/utils/path.ts"),
              "@opencode-ai/core/util/encode": path.join(srcDir, "lib/utils/encode.ts"),
              "@opencode-ai/core/util/binary": path.join(srcDir, "lib/utils/binary.ts"),
              "@opencode-ai/core/util/retry": path.join(srcDir, "lib/utils/retry.ts"),
              "@opencode-ai/core/util/array": path.join(srcDir, "lib/utils/array.ts"),
              "@sentry/solid": path.join(srcDir, "lib/stubs/sentry.ts"),
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
    {
      name: "opencode-sandbox:spa-fallback",
      closeBundle() {
        const distDir = fileURLToPath(new URL("./dist", import.meta.url))
        const indexPath = path.join(distDir, "index.html")
        const fallbackPath = path.join(distDir, "404.html")
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, fallbackPath)
        }
      },
    },
  ],
  // Relative base: emit "./assets/..." so a single build is portable across any deploy
  // path (root, /branch/master/, /branch/pr-N/) without baking the path in at build time.
  // The SolidJS Router base is derived from the document URL at runtime (see app.tsx).
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 42731,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["@wasmer/sdk"],
  },
})
