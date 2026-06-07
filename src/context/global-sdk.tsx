import type { Event as SDKEvent } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { makeEventListener } from "@solid-primitives/event-listener"
import { onCleanup } from "solid-js"
import { showToast } from "@opencode-ai/ui/toast"
import { useServer } from "./server"
import { createSandboxClient, SANDBOX_LIMITATION_EVENT } from "@/lib/sandbox-sdk"
import { onSandboxEvent } from "@/lib/sandbox-agent"

export const { use: useGlobalSDK, provider: GlobalSDKProvider } = createSimpleContext({
  name: "GlobalSDK",
  init: () => {
    const server = useServer()

    const emitter = createGlobalEmitter<{
      [key: string]: SDKEvent
    }>()

    const unsub = onSandboxEvent((event: unknown) => {
      emitter.emit("sandbox", event as SDKEvent)
    })
    onCleanup(unsub)

    const client = createSandboxClient({
      emitter: {
        emit: (key, event) => emitter.emit(key, event),
      },
    })

    makeEventListener(
      window,
      SANDBOX_LIMITATION_EVENT,
      (event) => {
        const detail = (event as CustomEvent<{ method?: string; description?: string }>).detail
        showToast({
          variant: "warning",
          title: `Browser sandbox limitation${detail?.method ? `: ${detail.method}` : ""}`,
          description: detail?.description ?? "This SDK feature is not available in the browser sandbox.",
        })
      },
      { passive: true },
    )

    return {
      url: server.current?.http?.url ?? "http://localhost:0",
      client,
      event: {
        on: emitter.on.bind(emitter),
        listen: emitter.listen.bind(emitter),
        start: () => Promise.resolve(),
      },
      createClient(_opts: any) {
        return client
      },
    }
  },
})
