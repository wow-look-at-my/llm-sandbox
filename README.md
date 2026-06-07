# OpenCode Sandbox

A browser-based AI coding agent using the official OpenCode web UI, running entirely client-side. No backend server required.

## How it works

- **UI**: The exact official OpenCode web interface (Solid.js), extracted from [anomalyco/opencode](https://github.com/anomalyco/opencode)
- **Filesystem**: [Origin Private File System (OPFS)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) -- persistent virtual filesystem in the browser
- **AI**: Direct OpenAI-compatible API calls from the browser (user provides their own key)
- **Storage**: IndexedDB for session/message persistence

The agent has OPFS file tools (`read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`) and browser-backed Git tools (`git_clone`, `git_status`, `git_switch_branch`, `git_commit`, `git_push`).

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first launch, enter your API key and endpoint.

## Configuration

The settings dialog accepts:
- **API Base URL**: `https://api.openai.com`, `https://openrouter.ai/api`, or any OpenAI-compatible endpoint
- **API Key**: Your key (stored in localStorage, only sent to your configured endpoint)
- **Model**: `gpt-4o`, `claude-sonnet-4-20250514` (via OpenRouter), etc.

## Architecture

```
OpenCode UI (Solid.js) -- unchanged
    |
Stub SDK Client (same interface, no server)
    |
+---+---+---+
|   |       |
OPFS  OpenAI   IndexedDB
```

### Key files

| Path | Purpose |
|------|---------|
| `src/lib/opfs.ts` | OPFS virtual filesystem |
| `src/lib/ai/agent-loop.ts` | Agent loop (stream + tool execution) |
| `src/lib/ai/tool-executor.ts` | Tool dispatch to OPFS |
| `src/lib/git/sandbox-git.ts` | Browser Git operations backed by OPFS |
| `src/lib/sandbox-permissions.ts` | Pending permission requests, including explicit git push approvals |
| `src/lib/sandbox-agent.ts` | Bridges agent loop with OpenCode event system |
| `src/lib/sandbox-settings.ts` | API key/endpoint/model config |
| `src/lib/db.ts` | IndexedDB sessions/messages |
| `src/context/global-sdk.tsx` | Stub SDK client (replaces server connection) |

## Limitations

- No shell/bash execution (sandboxed)
- Git operations use browser HTTP and OPFS. `git_push` requires explicit user approval, with an optional exact-target "Allow always" approval.
- No LSP/MCP integration
- No terminal (ghostty-web removed)
- CORS: Your API endpoint must allow browser CORS. OpenAI does; some providers may not.
