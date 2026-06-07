export type SandboxEventHandler = (event: unknown) => void

const handlers = new Set<SandboxEventHandler>()

export function onSandboxEvent(handler: SandboxEventHandler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

export function emitSandboxEvent(event: unknown) {
  for (const handler of handlers) {
    try {
      handler(event)
    } catch (e) {
      console.error("[sandbox-event] event handler error:", e)
    }
  }
}
