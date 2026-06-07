import type { PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { emitSandboxEvent } from "./sandbox-events"

type PermissionResponse = "once" | "always" | "reject"

type PendingPermission = {
  request: PermissionRequest
  resolve: (response: PermissionResponse) => void
  cleanup: () => void
}

const pending = new Map<string, PendingPermission>()

export function listSandboxPermissions(sessionID?: string): PermissionRequest[] {
  const requests = [...pending.values()].map((item) => item.request)
  if (!sessionID) return requests
  return requests.filter((item) => item.sessionID === sessionID)
}

export function respondSandboxPermission(input: {
  sessionID: string
  permissionID: string
  response: PermissionResponse
}): boolean {
  const item = pending.get(input.permissionID)
  if (!item || item.request.sessionID !== input.sessionID) return false

  pending.delete(input.permissionID)
  item.cleanup()
  emitSandboxEvent({
    type: "permission.replied",
    properties: { sessionID: input.sessionID, requestID: input.permissionID },
  })
  item.resolve(input.response)
  return true
}

export async function requestSandboxPermission(input: {
  sessionID: string
  permission: string
  patterns: string[]
  metadata?: Record<string, unknown>
  signal?: AbortSignal
}): Promise<PermissionResponse> {
  if (input.signal?.aborted) return "reject"

  const id = crypto.randomUUID()
  const request = {
    id,
    sessionID: input.sessionID,
    permission: input.permission,
    patterns: input.patterns,
    metadata: input.metadata ?? {},
    always: [],
  } as PermissionRequest

  return await new Promise<PermissionResponse>((resolve) => {
    const abort = () => {
      const item = pending.get(id)
      if (!item) return
      pending.delete(id)
      item.cleanup()
      emitSandboxEvent({
        type: "permission.replied",
        properties: { sessionID: input.sessionID, requestID: id },
      })
      resolve("reject")
    }

    const cleanup = () => input.signal?.removeEventListener("abort", abort)
    pending.set(id, { request, resolve, cleanup })
    input.signal?.addEventListener("abort", abort, { once: true })
    emitSandboxEvent({ type: "permission.asked", properties: request })
  })
}
