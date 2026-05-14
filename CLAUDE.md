# OpenCode Sandbox

Browser-based AI coding agent using the official OpenCode web UI, running entirely client-side with OPFS virtual filesystem.

## Project structure

- `src/` -- OpenCode app source (Solid.js, extracted from `anomalyco/opencode` `packages/app`)
- `src/ui/` -- OpenCode UI component library (from `packages/ui`)
- `src/lib/` -- Sandbox-specific implementations:
  - `opfs.ts` -- OPFS virtual filesystem
  - `ai/` -- Agent core (tool definitions, stream parser, agent loop, system prompt)
  - `db.ts` -- IndexedDB persistence
  - `sandbox-agent.ts` -- Bridges agent loop with OpenCode events
  - `sandbox-settings.ts` -- API key/endpoint config
  - `event-bus.ts` -- Local event emitter
  - `utils/` -- Inlined core utilities (path, encode, binary, retry, array)
  - `stubs/` -- Stubs for unavailable deps (sentry, ghostty-web)
- `src/context/global-sdk.tsx` -- Replaced: stub SDK client for serverless operation

## Build

```bash
npm install
npm run dev    # dev server on :3000
npm run build  # production build to dist/
```

## Key architecture decisions

- Vite resolves `@opencode-ai/ui/*` imports via a custom plugin that maps to `src/ui/`
- `@opencode-ai/core/util/*` is aliased to inlined utility files
- `@opencode-ai/sdk` is installed from npm for types; `createOpencodeClient` is never called
- `global-sdk.tsx` returns a Proxy-based stub client that routes to OPFS/IndexedDB/agent
- `@sentry/solid` and `ghostty-web` are stubbed out via Vite aliases

## Framework

- **Solid.js** (not React) -- JSX with `jsxImportSource: "solid-js"`
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **Kobalte** for accessible UI primitives
- **Effect** (v4 beta) for functional programming patterns
