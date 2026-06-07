type ResponseHeaders = { get(name: string): string | null }

export type SandboxMessageRow = {
  id: string
  sessionId?: string
  sessionID?: string
  role: "user" | "assistant"
  parts?: unknown[]
  time: { created: number; completed?: number }
  metadata?: Record<string, unknown>
}

function sandboxResponseHeaders(cursor?: string): ResponseHeaders {
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
      status: 200,
      headers: sandboxResponseHeaders(cursor),
    },
  }
}
