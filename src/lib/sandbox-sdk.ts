import type { Event } from "@opencode-ai/sdk/v2/client"
import { abortCurrentSession, sendMessage } from "@/lib/sandbox-agent"
import * as sandboxDb from "@/lib/db"
import * as opfs from "@/lib/opfs"
import { createOpfsSdkAdapter } from "@/context/global-sdk-opfs"
import { listSandboxPermissions, respondSandboxPermission } from "@/lib/sandbox-permissions"
export { formatSandboxMessagesResponse } from "@/lib/sandbox-message-format"
import { formatSandboxMessagesResponse } from "@/lib/sandbox-message-format"

export type SandboxSupport = "supported" | "stubbed-empty" | "unsupported"

export interface SandboxMethodClassification {
  method: string
  support: SandboxSupport
  behavior: string
}

export const SANDBOX_SDK_METHODS: SandboxMethodClassification[] = [
  { method: "app.agents", support: "stubbed-empty", behavior: "Returns the browser sandbox default agent." },
  { method: "app.skills", support: "stubbed-empty", behavior: "Returns an empty skill list." },
  { method: "auth.remove", support: "supported", behavior: "Removes browser-local provider credentials from localStorage." },
  { method: "auth.set", support: "supported", behavior: "Persists browser-local provider credentials to localStorage." },
  { method: "command.list", support: "stubbed-empty", behavior: "Returns an empty command list." },
  { method: "config.get", support: "supported", behavior: "Reads browser-local provider configuration from localStorage." },
  { method: "config.providers", support: "supported", behavior: "Builds provider metadata from browser-local provider configuration." },
  { method: "file.list", support: "supported", behavior: "Lists OPFS directory entries as SDK FileNode-like records." },
  { method: "file.read", support: "supported", behavior: "Reads file contents from OPFS." },
  { method: "file.status", support: "stubbed-empty", behavior: "Returns no VCS file status entries." },
  { method: "find.files", support: "supported", behavior: "Finds OPFS files and directories by name, and text matches when no type filter is provided." },
  { method: "global.config.get", support: "supported", behavior: "Reads browser-local global configuration from localStorage." },
  { method: "global.config.update", support: "supported", behavior: "Persists browser-local global configuration to localStorage." },
  { method: "global.dispose", support: "stubbed-empty", behavior: "No-op success because there is no daemon connection to dispose." },
  { method: "global.event", support: "stubbed-empty", behavior: "Returns an empty event stream; live agent events come from sandbox-agent instead." },
  { method: "global.health", support: "stubbed-empty", behavior: "Returns an ok health check for the in-browser compatibility layer." },
  { method: "instance.dispose", support: "stubbed-empty", behavior: "No-op success because browser workspaces do not own daemon instances." },
  { method: "lsp.status", support: "stubbed-empty", behavior: "Returns no language servers." },
  { method: "mcp.connect", support: "unsupported", behavior: "Returns a disconnected status after showing that MCP servers are unavailable." },
  { method: "mcp.disconnect", support: "unsupported", behavior: "Returns a disconnected status after showing that MCP servers are unavailable." },
  { method: "mcp.status", support: "stubbed-empty", behavior: "Returns no MCP servers." },
  { method: "path.get", support: "supported", behavior: "Returns the browser sandbox root directory metadata." },
  { method: "permission.list", support: "supported", behavior: "Returns pending browser sandbox permission requests." },
  { method: "permission.respond", support: "supported", behavior: "Responds to pending browser sandbox permission requests." },
  { method: "project.current", support: "supported", behavior: "Returns the singleton browser Sandbox project." },
  { method: "project.initGit", support: "unsupported", behavior: "Returns false after showing that Git initialization is unavailable." },
  { method: "project.list", support: "supported", behavior: "Returns the singleton browser Sandbox project." },
  { method: "project.update", support: "unsupported", behavior: "Returns the Sandbox project after showing that project editing is unavailable." },
  { method: "provider.auth", support: "supported", behavior: "Returns API-key auth metadata for browser-local configured providers." },
  { method: "provider.list", support: "supported", behavior: "Builds provider metadata from browser-local provider configuration." },
  { method: "provider.oauth.authorize", support: "unsupported", behavior: "Returns a typed OAuth unavailable result after showing a limitation." },
  { method: "provider.oauth.callback", support: "unsupported", behavior: "Returns a typed OAuth unavailable result after showing a limitation." },
  { method: "pty.connectToken", support: "stubbed-empty", behavior: "Unused for browser-local Wasmer terminals." },
  { method: "pty.create", support: "supported", behavior: "Returns a browser-local Wasmer terminal record." },
  { method: "pty.get", support: "unsupported", behavior: "Returns HTTP 404-like response because no PTY backend exists." },
  { method: "pty.remove", support: "stubbed-empty", behavior: "No-op success for local terminal tab cleanup." },
  { method: "pty.shells", support: "supported", behavior: "Returns the browser-local Wasmer shell." },
  { method: "pty.update", support: "stubbed-empty", behavior: "No-op success for local terminal tab metadata." },
  { method: "question.list", support: "stubbed-empty", behavior: "Returns no pending questions." },
  { method: "question.reject", support: "unsupported", behavior: "Returns success after showing that agent questions are unavailable." },
  { method: "question.reply", support: "unsupported", behavior: "Returns success after showing that agent questions are unavailable." },
  { method: "session.abort", support: "supported", behavior: "Aborts the active in-browser agent run." },
  { method: "session.children", support: "stubbed-empty", behavior: "Returns no child sessions." },
  { method: "session.command", support: "unsupported", behavior: "Returns a typed message id after showing that server commands are unavailable." },
  { method: "session.create", support: "supported", behavior: "Creates an IndexedDB-backed session." },
  { method: "session.delete", support: "supported", behavior: "Deletes an IndexedDB-backed session and messages." },
  { method: "session.diff", support: "stubbed-empty", behavior: "Returns no VCS diff entries." },
  { method: "session.fork", support: "unsupported", behavior: "Returns undefined after showing that session forking is unavailable." },
  { method: "session.get", support: "supported", behavior: "Reads session metadata from IndexedDB." },
  { method: "session.list", support: "supported", behavior: "Lists IndexedDB-backed sessions." },
  { method: "session.messages", support: "supported", behavior: "Lists IndexedDB-backed session messages." },
  { method: "session.prompt", support: "supported", behavior: "Sends text parts to the in-browser sandbox agent." },
  { method: "session.promptAsync", support: "supported", behavior: "Sends text parts to the in-browser sandbox agent." },
  { method: "session.revert", support: "unsupported", behavior: "Returns success after showing that message revert is unavailable." },
  { method: "session.share", support: "unsupported", behavior: "Returns undefined after showing that cloud sharing is unavailable." },
  { method: "session.shell", support: "unsupported", behavior: "Returns a typed message id after showing that shell execution is unavailable." },
  { method: "session.status", support: "stubbed-empty", behavior: "Returns an empty session status map." },
  { method: "session.summarize", support: "unsupported", behavior: "Returns success after showing that server summarization is unavailable." },
  { method: "session.todo", support: "stubbed-empty", behavior: "Returns no todos." },
  { method: "session.unrevert", support: "unsupported", behavior: "Returns success after showing that message unrevert requires unavailable server patch state." },
  { method: "session.unshare", support: "unsupported", behavior: "Returns success after showing that cloud sharing is unavailable." },
  { method: "session.update", support: "supported", behavior: "Updates IndexedDB-backed session metadata." },
  { method: "vcs.diff", support: "stubbed-empty", behavior: "Returns no VCS diff." },
  { method: "vcs.get", support: "stubbed-empty", behavior: "Returns an empty VCS status." },
  { method: "worktree.create", support: "unsupported", behavior: "Returns undefined after showing that Git worktrees are unavailable." },
  { method: "worktree.list", support: "stubbed-empty", behavior: "Returns no worktrees." },
  { method: "worktree.remove", support: "unsupported", behavior: "Returns success after showing that Git worktrees are unavailable." },
  { method: "worktree.reset", support: "unsupported", behavior: "Returns success after showing that Git worktrees are unavailable." },
]

export const SANDBOX_LIMITATION_EVENT = "opencode-sandbox:limitation"

type SdkResponse<T> = { data: T; response: { status: number } }
type SdkStreamResponse<T> = { stream: AsyncIterable<T> }

type SandboxEventEmitter = {
  emit: (key: string, event: Event) => void
}

const SANDBOX_PROJECT_TIME = (() => {
  const now = Date.now()
  return { created: now, updated: now }
})()

const SANDBOX_PROJECT = {
  id: "sandbox",
  path: "/",
  worktree: "/",
  name: "Sandbox",
  sandboxes: [],
  time: SANDBOX_PROJECT_TIME,
}
const SANDBOX_PATH = { cwd: "/", root: "/", directory: "/", home: "/" }
const CONFIG_KEY = "opencode-global-config"
const AUTH_KEY = "opencode-auth"

function ok<T>(data: T): SdkResponse<T> {
  return { data, response: { status: 200 } }
}

function response<T>(status: number, data: T): SdkResponse<T> {
  return { data, response: { status } }
}

function limitation(method: string, description: string) {
  console.warn(`[sandbox-sdk] ${method}: ${description}`)
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(SANDBOX_LIMITATION_EVENT, {
      detail: { method, description },
    }),
  )
}

function unsupported<T>(method: string, data: T, description: string): Promise<SdkResponse<T>> {
  limitation(method, description)
  return Promise.resolve(ok(data))
}

function messageID() {
  return { id: crypto.randomUUID() }
}

function promptContent(parts?: Array<{ type?: string; text?: string }>) {
  return (parts ?? []).filter((part) => part.type === "text").map((part) => part.text || "").join("\n")
}

function loadStoredRecord(key: string): Record<string, any> {
  if (typeof localStorage === "undefined") return {}
  try {
    return JSON.parse(localStorage.getItem(key) || "{}")
  } catch {
    return {}
  }
}

function saveStoredRecord(key: string, value: Record<string, any>) {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(key, JSON.stringify(value))
}

function loadConfig(): Record<string, any> {
  return loadStoredRecord(CONFIG_KEY)
}

function saveConfig(config: Record<string, any>) {
  saveStoredRecord(CONFIG_KEY, config)
}

function loadAuth(): Record<string, any> {
  return loadStoredRecord(AUTH_KEY)
}

function saveAuth(auth: Record<string, any>) {
  saveStoredRecord(AUTH_KEY, auth)
}

function buildProviderList(config: Record<string, any>) {
  const providerConfigs: Record<string, any> = config.provider ?? {}
  const auth = loadAuth()
  const disabledSet = new Set<string>(config.disabled_providers ?? [])

  const all = Object.entries(providerConfigs)
    .filter(([id]) => !disabledSet.has(id))
    .map(([id, cfg]: [string, any]) => ({
      id,
      name: cfg.name || id,
      source: "custom" as const,
      env: cfg.env ? [cfg.env] : ([] as string[]),
      key: auth[id]?.key ? `${id.toUpperCase()}_API_KEY` : undefined,
      options: cfg.options ?? {},
      models: Object.fromEntries(
        Object.entries((cfg.models ?? {}) as Record<string, any>).map(([modelId, modelCfg]: [string, any]) => [
          modelId,
          {
            id: modelId,
            providerID: id,
            name: modelCfg.name || modelId,
            api: {
              id: modelId,
              url: cfg.options?.baseURL ?? "",
              npm: cfg.npm ?? "@ai-sdk/openai-compatible",
            },
            capabilities: {
              temperature: true,
              reasoning: false,
              attachment: false,
              toolcall: true,
              input: { text: true, audio: false, image: false, video: false, pdf: false },
              output: { text: true, audio: false, image: false, streaming: true },
            },
          },
        ]),
      ),
    }))

  const connected = Object.keys(auth).filter((id) => !disabledSet.has(id) && providerConfigs[id])

  return { all, connected, default: config.default ?? {} }
}

type SandboxDbSession = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  parentID?: string
}

function sessionPayload(session: SandboxDbSession) {
  return {
    id: session.id,
    title: session.title,
    parentID: session.parentID,
    time: { created: session.createdAt, updated: session.updatedAt },
  }
}

async function emptyStream(): Promise<SdkStreamResponse<Event>> {
  return { stream: (async function* () {})() }
}

export function createSandboxClient(_options?: { emitter?: SandboxEventEmitter }): any {
  const opfsSdk = createOpfsSdkAdapter(opfs)
  const client = {
    app: {
      agents: async () => ok([{ name: "build", mode: "primary", permission: {}, options: {} }]),
      skills: async () => ok([]),
    },
    auth: {
      remove: async (params: { providerID: string }) => {
        const auth = loadAuth()
        delete auth[params.providerID]
        saveAuth(auth)
        return ok(true)
      },
      set: async (params: { providerID: string; auth?: any }) => {
        if (params.auth) {
          const auth = loadAuth()
          auth[params.providerID] = params.auth
          saveAuth(auth)
        }
        return ok(true)
      },
    },
    command: {
      list: async () => ok([]),
    },
    config: {
      get: async () => ok(loadConfig()),
      providers: async () => {
        const providers = buildProviderList(loadConfig())
        return ok({ providers: providers.all, default: providers.default })
      },
    },
    file: {
      list: opfsSdk.file.list,
      read: opfsSdk.file.read,
      status: opfsSdk.file.status,
    },
    find: {
      files: opfsSdk.find.files,
    },
    global: {
      health: async () => ok({ ok: true }),
      event: emptyStream,
      dispose: async () => ok(true),
      config: {
        get: async () => ok(loadConfig()),
        update: async (params?: { config?: any }) => {
          if (!params?.config) return ok(loadConfig())
          const existing = loadConfig()
          const merged = { ...existing, ...params.config }
          if (existing.provider && params.config.provider) {
            merged.provider = { ...existing.provider, ...params.config.provider }
          }
          saveConfig(merged)
          return ok(merged)
        },
      },
    },
    instance: {
      dispose: async () => ok(true),
    },
    lsp: {
      status: async () => ok([]),
    },
    mcp: {
      status: async () => ok({}),
      connect: async (input: { name?: string }) => unsupported("mcp.connect", { name: input.name, status: "disconnected" }, "MCP servers require a host process and are unavailable in the browser sandbox."),
      disconnect: async (input: { name?: string }) => unsupported("mcp.disconnect", { name: input.name, status: "disconnected" }, "MCP servers require a host process and are unavailable in the browser sandbox."),
    },
    path: {
      get: async () => ok(SANDBOX_PATH),
    },
    permission: {
      list: async (params?: { sessionID?: string }) => ok(listSandboxPermissions(params?.sessionID)),
      respond: async (params: { sessionID: string; permissionID: string; response: "once" | "always" | "reject" }) =>
        ok(respondSandboxPermission(params)),
    },
    project: {
      list: async () => ok([SANDBOX_PROJECT]),
      current: async () => ok(SANDBOX_PROJECT),
      update: async () => unsupported("project.update", SANDBOX_PROJECT, "Project metadata is fixed to the browser Sandbox workspace."),
      initGit: async () => unsupported("project.initGit", false, "Git initialization requires a host filesystem and is unavailable in the browser sandbox."),
    },
    provider: {
      list: async () => ok(buildProviderList(loadConfig())),
      auth: async () => {
        const providerConfigs: Record<string, any> = loadConfig().provider ?? {}
        const result: Record<string, any[]> = {}
        for (const id of Object.keys(providerConfigs)) {
          result[id] = [{ type: "api", label: "API Key" }]
        }
        return ok(result)
      },
      oauth: {
        authorize: async () => unsupported("provider.oauth.authorize", { url: undefined, instructions: undefined, error: "unsupported-in-browser-sandbox" }, "Provider OAuth requires a server callback and is unavailable in the browser sandbox."),
        callback: async () => unsupported("provider.oauth.callback", { error: "unsupported-in-browser-sandbox" }, "Provider OAuth requires a server callback and is unavailable in the browser sandbox."),
      },
    },
    pty: {
      create: async (input?: { title?: string }) => ok({ id: crypto.randomUUID(), title: input?.title ?? "Wasmer terminal" }),
      get: async () => response(404, undefined),
      connectToken: async () => {
        limitation("pty.connectToken", "Shell terminals require a host PTY process and are unavailable in the browser sandbox.")
        return response(405, { ticket: undefined })
      },
      remove: async () => ok(true),
      shells: async () => ok(["wasmer/bash"]),
      update: async () => ok(true),
    },
    question: {
      list: async () => ok([]),
      reply: async () => unsupported("question.reply", true, "Agent questions are not emitted by the browser sandbox agent."),
      reject: async () => unsupported("question.reject", true, "Agent questions are not emitted by the browser sandbox agent."),
    },
    session: {
      abort: async () => {
        abortCurrentSession()
        return ok(true)
      },
      children: async () => ok([]),
      command: async () => unsupported("session.command", messageID(), "Server-side slash commands are unavailable in the browser sandbox."),
      create: async (params?: { title?: string; parentID?: string }) => ok(sessionPayload(await sandboxDb.createSession(params?.title, params?.parentID))),
      delete: async (params: { sessionID: string }) => {
        await sandboxDb.deleteSession(params.sessionID)
        return ok(true)
      },
      diff: async () => ok([]),
      fork: async () => unsupported("session.fork", undefined, "Session forking requires server-side state that is unavailable in the browser sandbox."),
      get: async (params: { sessionID: string }) => {
        const session = await sandboxDb.getSession(params.sessionID)
        return ok(session ? sessionPayload(session) : undefined)
      },
      list: async () => ok((await sandboxDb.listSessions()).map(sessionPayload)),
      messages: async (params: { sessionID: string; limit?: number; before?: string }) =>
        formatSandboxMessagesResponse(await sandboxDb.getMessages(params.sessionID), params),
      prompt: async (params: {
        sessionID: string
        agent?: string
        messageID?: string
        model?: string | { providerID?: string; modelID?: string }
        parts?: Array<{ type?: string; text?: string }>
      }) => {
        const id = params.messageID ?? messageID().id
        const content = promptContent(params.parts)
        if (content)
          sendMessage(params.sessionID, content, {
            agent: params.agent,
            messageID: id,
            model: params.model,
          }).catch((err) =>
            console.error("[sandbox] agent error:", err),
          )
        return ok({ id })
      },
      promptAsync: async (params: {
        sessionID: string
        agent?: string
        messageID?: string
        model?: string | { providerID?: string; modelID?: string }
        parts?: Array<{ type?: string; text?: string }>
      }) => {
        const id = params.messageID ?? messageID().id
        const content = promptContent(params.parts)
        if (content)
          await sendMessage(params.sessionID, content, {
            agent: params.agent,
            messageID: id,
            model: params.model,
          })
        return ok({ id })
      },
      revert: async () => unsupported("session.revert", true, "Message revert requires server-side patch state and is unavailable in the browser sandbox."),
      share: async () => unsupported("session.share", undefined, "Cloud session sharing is unavailable in the browser sandbox."),
      shell: async () => unsupported("session.shell", messageID(), "Shell execution requires a host process and is unavailable in the browser sandbox."),
      status: async () => ok({}),
      summarize: async () => unsupported("session.summarize", true, "Server-side summarization is unavailable in the browser sandbox."),
      todo: async () => ok([]),
      unrevert: async () => unsupported("session.unrevert", true, "Message unrevert requires server-side patch state and is unavailable in the browser sandbox."),
      unshare: async () => unsupported("session.unshare", true, "Cloud session sharing is unavailable in the browser sandbox."),
      update: async (params: { sessionID: string; title?: string; time?: { archived?: number } }) => {
        if (params.title === undefined) {
          const current = await sandboxDb.getSession(params.sessionID)
          return ok(current ? sessionPayload(current) : undefined)
        }
        return ok(sessionPayload(await sandboxDb.updateSession(params.sessionID, { title: params.title })))
      },
    },
    vcs: {
      get: async () => ok({}),
      diff: async () => ok([]),
    },
    worktree: {
      create: async () => unsupported("worktree.create", undefined, "Git worktrees require a host Git checkout and are unavailable in the browser sandbox."),
      list: async () => ok([]),
      remove: async () => unsupported("worktree.remove", true, "Git worktrees require a host Git checkout and are unavailable in the browser sandbox."),
      reset: async () => unsupported("worktree.reset", true, "Git worktrees require a host Git checkout and are unavailable in the browser sandbox."),
    },
    v2: {
      model: { list: async () => ok([]) },
      provider: { list: async () => ok([]), get: async () => ok(undefined) },
      session: { list: async () => ok([]), messages: async () => ok([]) },
    },
  }

  return client
}

export type SandboxClient = ReturnType<typeof createSandboxClient>
