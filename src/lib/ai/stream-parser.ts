import type { StreamChunk, StreamDelta, ToolCall } from "./types"

/**
 * Async generator that parses an SSE response body into typed StreamChunk objects.
 * Handles chunks that arrive split across multi-byte boundaries and buffers
 * partial lines until a complete newline-terminated line is available.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<StreamChunk> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("Response body is not readable")

  const decoder = new TextDecoder("utf-8")
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      // The last element is either an incomplete line or "" -- keep it in the buffer.
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === "" || trimmed === "data: [DONE]") continue
        if (!trimmed.startsWith("data: ")) continue

        const json = trimmed.slice(6) // strip "data: "
        try {
          yield JSON.parse(json) as StreamChunk
        } catch {
          // Skip malformed JSON lines rather than crashing the stream.
        }
      }
    }

    // Flush any remaining data in the decoder and buffer.
    buffer += decoder.decode()
    if (buffer.trim() && buffer.trim() !== "data: [DONE]" && buffer.trim().startsWith("data: ")) {
      try {
        yield JSON.parse(buffer.trim().slice(6)) as StreamChunk
      } catch {
        // Ignore trailing malformed data.
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Accumulate streamed tool-call deltas into complete ToolCall objects.
 *
 * Each delta may contain partial tool_calls keyed by `index`. This function
 * merges them in order so that the final result contains fully-assembled
 * id, type, function name, and arguments for every tool call the model made.
 */
export function assembleToolCalls(deltas: StreamDelta[]): ToolCall[] {
  const acc = new Map<number, { id: string; type: string; name: string; arguments: string }>()

  for (const delta of deltas) {
    if (!delta.tool_calls) continue
    for (const tc of delta.tool_calls) {
      let entry = acc.get(tc.index)
      if (!entry) {
        entry = { id: "", type: "function", name: "", arguments: "" }
        acc.set(tc.index, entry)
      }
      if (tc.id) entry.id = tc.id
      if (tc.type) entry.type = tc.type
      if (tc.function?.name) entry.name += tc.function.name
      if (tc.function?.arguments) entry.arguments += tc.function.arguments
    }
  }

  return Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([, entry]) => ({
      id: entry.id,
      type: "function" as const,
      function: { name: entry.name, arguments: entry.arguments },
    }))
}
