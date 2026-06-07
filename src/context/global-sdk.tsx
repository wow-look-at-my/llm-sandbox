import type { Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { onCleanup } from "solid-js"
import { useServer } from "./server"
import { sendMessage, abortCurrentSession, onSandboxEvent } from "@/lib/sandbox-agent"
import * as sandboxDb from "@/lib/db"
import * as opfs from "@/lib/opfs"
import { createOpfsSdkAdapter } from "./global-sdk-opfs"

type SandboxMessageRow = {
  id: string
  sessionId?: string
  sessionID?: string
  role: "user" | "assistant"
  parts?: unknown[]
  time: { created: number; completed?: number }
  metadata?: Record<string, unknown>
}

function sandboxResponseHeaders(cursor?: string) {
  return {
    get(name: string) {
      if (name.toLowerCase() !== "x-next-cursor") return null
      return cursor ?? null
    },
  }
}

function normalizeSandboxPart(part: unknown, input: { sessionID: string; messageID: string; index: number }) {
  const fallbackID = `${input.messageID}-part-${input.index}`
  if (!part || typeof part !== "object" || Array.isArray(part)) {
    return {
      id: fallbackID,
      sessionID: input.sessionID,
      messageID: input.messageID,
      type: "text",
      text: String(part ?? ""),
    }
  }

  const current = part as Record<string, unknown>
  return {
    id: typeof current.id === "string" ? current.id : fallbackID,
    ...current,
    sessionID: typeof current.sessionID === "string" ? current.sessionID : input.sessionID,
    messageID: typeof current.messageID === "string" ? current.messageID : input.messageID,
  }
}

export function formatSandboxMessagesResponse(
  messages: SandboxMessageRow[],
  params: { sessionID: string; limit?: number; before?: string },
) {
  const ordered = [...messages].sort((a, b) => {
    const time = (a.time?.created ?? 0) - (b.time?.created ?? 0)
    return time || a.id.localeCompare(b.id)
  })
  const beforeIndex = params.before ? ordered.findIndex((message) => message.id === params.before) : -1
  const available = beforeIndex >= 0 ? ordered.slice(0, beforeIndex) : ordered
  const limit = params.limit && params.limit > 0 ? params.limit : available.length
  const start = Math.max(available.length - limit, 0)
  const page = available.slice(start)
  const cursor = start > 0 ? page[0]?.id : undefined

  return {
    data: page.map((message) => {
      const sessionID = message.sessionID ?? message.sessionId ?? params.sessionID
      return {
        info: {
          ...(message.metadata ?? {}),
          id: message.id,
          sessionID,
          role: message.role,
          time: message.time,
        },
        parts: (message.parts ?? []).map((part, index) =>
          normalizeSandboxPart(part, { sessionID, messageID: message.id, index }),
        ),
      }
    }),
    response: {
      headers: sandboxResponseHeaders(cursor),
    },
  }
}

export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()

    const emitter = createGlobalEmitter<{
      [key: string]: Event
    }>()

    const unsub = onSandboxEvent((event: unknown) => {
      emitter.emit("sandbox", event as Event)
    })
    onCleanup(unsub)

    const noop = async () => ({ data: undefined })
    const noopList = async () => ({ data: [] })
    const opfsSdk = createOpfsSdkAdapter(opfs)

    const stubClient = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "session") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "list")
                    return async () => {
                      const sessions = await sandboxDb.listSessions()
                      return {
                        data: sessions.map((s) => ({
                          id: s.id,
                          title: s.title,
                          parentID: s.parentID,
                          time: { created: s.createdAt, updated: s.updatedAt },
                        })),
                      }
                    }
                  if (method === "create")
                    return async (params?: { title?: string }) => {
                      const session = await sandboxDb.createSession(params?.title)
                      return {
                        data: {
                          id: session.id,
                          title: session.title,
                          time: { created: session.createdAt, updated: session.updatedAt },
                        },
                      }
                    }
                  if (method === "prompt" || method === "promptAsync")
                    return async (params: { sessionID: string; parts?: any[] }) => {
                      const textParts = (params.parts ?? []).filter((p: any) => p.type === "text")
                      const content = textParts.map((p: any) => p.text || "").join("\n")
                      if (content) {
                        sendMessage(params.sessionID, content).catch((err) =>
                          console.error("[sandbox] agent error:", err),
                        )
                      }
                      return { data: { id: crypto.randomUUID() } }
                    }
                  if (method === "abort")
                    return async () => {
                      abortCurrentSession()
                      return { data: true }
                    }
                  if (method === "messages")
                    return async (params: { sessionID: string; limit?: number; before?: string }) => {
                      const msgs = await sandboxDb.getMessages(params.sessionID)
                      return formatSandboxMessagesResponse(msgs, params)
                    }
                  if (method === "delete")
                    return async (params: { sessionID: string }) => {
                      await sandboxDb.deleteSession(params.sessionID)
                      return { data: true }
                    }
                  if (method === "update")
                    return async (params: { sessionID: string; title?: string }) => {
                      const updated = await sandboxDb.updateSession(params.sessionID, {
                        title: params.title,
                      })
                      return { data: updated }
                    }
                  if (method === "get")
                    return async (params: { sessionID: string }) => {
                      const session = await sandboxDb.getSession(params.sessionID)
                      if (!session) return { data: undefined }
                      return {
                        data: {
                          id: session.id,
                          title: session.title,
                          time: { created: session.createdAt, updated: session.updatedAt },
                        },
                      }
                    }
                  if (method === "diff") return noopList
                  if (method === "todo") return noopList
                  if (method === "children") return noopList
                  if (method === "status") return async () => ({ data: {} })
                  return noop
                },
              },
            )
          }
          if (prop === "config") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "providers") return async () => ({ data: { providers: [], default: {} } })
                  if (method === "get") return async () => ({ data: {} })
                  return noop
                },
              },
            )
          }
          if (prop === "app") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "agents") return async () => ({ data: [{ id: "default", name: "Default", mode: "build" }] })
                  if (method === "skills") return noopList
                  return noop
                },
              },
            )
          }
          if (prop === "file") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "list") return opfsSdk.file.list
                  if (method === "read") return opfsSdk.file.read
                  if (method === "status") return opfsSdk.file.status
                  return noop
                },
              },
            )
          }
          if (prop === "find") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "files") return opfsSdk.find.files
                  return noopList
                },
              },
            )
          }
          if (prop === "project") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "list") return async () => ({ data: [{ id: "sandbox", path: "/", name: "Sandbox" }] })
                  if (method === "current") return async () => ({ data: { id: "sandbox", path: "/", name: "Sandbox" } })
                  return noop
                },
              },
            )
          }
          if (prop === "path") {
            return {
              get: async () => ({ data: { cwd: "/", root: "/" } }),
            }
          }
          if (prop === "provider") {
            return new Proxy(
              {},
              {
                get(_t, method) {
                  if (method === "list") return async () => ({ data: [] })
                  if (method === "auth") return async () => ({ data: [] })
                  return noop
                },
              },
            )
          }
          if (prop === "global") {
            return {
              health: async () => ({ data: { ok: true } }),
              event: async () => ({ stream: (async function* () {})() }),
              dispose: noop,
              config: {
                get: async () => ({ data: {} }),
                update: noop,
              },
            }
          }
          if (prop === "v2") {
            return new Proxy(
              {},
              {
                get(_t, sub) {
                  if (sub === "session") {
                    return new Proxy(
                      {},
                      {
                        get(_t2, method) {
                          if (method === "list") return noopList
                          if (method === "messages") return noopList
                          return noop
                        },
                      },
                    )
                  }
                  if (sub === "model") return { list: noopList }
                  if (sub === "provider") return { list: noopList, get: noop }
                  return {}
                },
              },
            )
          }
          return new Proxy(
            {},
            {
              get() {
                return noop
              },
            },
          )
        },
      },
    ) as any

    onCleanup(() => {})

    return {
      url: server.current?.http?.url ?? "http://localhost:0",
      client: stubClient,
      event: {
        on: emitter.on.bind(emitter),
        listen: emitter.listen.bind(emitter),
        start: () => Promise.resolve(),
      },
      createClient(_opts: any) {
        return stubClient
      },
    }
  },
})
