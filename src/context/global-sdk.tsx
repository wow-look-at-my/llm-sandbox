import type { Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { onCleanup } from "solid-js"
import { useServer } from "./server"

export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()

    const emitter = createGlobalEmitter<{
      [key: string]: Event
    }>()

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
                  if (method === "list") return noopList
                  if (method === "create") return async () => ({ data: { id: crypto.randomUUID(), title: "New Session" } })
                  if (method === "messages") return noopList
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
