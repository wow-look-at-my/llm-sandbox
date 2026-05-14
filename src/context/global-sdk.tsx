import type { Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { onCleanup } from "solid-js"
import { useServer } from "./server"
import { sendMessage, abortCurrentSession, onSandboxEvent } from "@/lib/sandbox-agent"
import * as sandboxDb from "@/lib/db"

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
                    return async (params: { sessionID: string }) => {
                      const msgs = await sandboxDb.getMessages(params.sessionID)
                      return { data: msgs }
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
                  if (method === "list") return noopList
                  if (method === "read") return async () => ({ data: { content: "" } })
                  if (method === "status") return noopList
                  return noop
                },
              },
            )
          }
          if (prop === "find") {
            return new Proxy(
              {},
              {
                get() {
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
