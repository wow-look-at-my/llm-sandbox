import type { AgentEvent, ChatMessage, StreamDelta, ToolCall } from "./types"
import { tools } from "./tool-definitions"
import { assembleToolCalls, parseSSEStream } from "./stream-parser"
import { executeTool } from "./tool-executor"

const MAX_ITERATIONS = 25

interface AgentConfig {
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * Core agent loop. Sends messages to an OpenAI-compatible chat completion
 * endpoint with streaming enabled, parses the SSE response, executes any
 * requested tool calls, and feeds the results back until the model produces
 * a final text response or the iteration limit is reached.
 *
 * Yields {@link AgentEvent} objects so the caller can drive UI updates
 * progressively (status changes, content deltas, tool results, etc.).
 */
export async function* runAgentLoop(
  config: AgentConfig,
  messages: ChatMessage[],
  signal: AbortSignal,
): AsyncGenerator<AgentEvent> {
  const conversation = [...messages]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal.aborted) return

    // --- 1. Request --------------------------------------------------------
    yield { type: "status_change", status: "thinking" }

    let response: Response
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: conversation,
          tools,
          stream: true,
        }),
        signal,
      })
    } catch (error) {
      if (signal.aborted) return
      const msg = error instanceof Error ? error.message : String(error)
      yield { type: "error", error: `Fetch failed: ${msg}` }
      return
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "(unreadable)")
      yield { type: "error", error: `API ${response.status}: ${body}` }
      return
    }

    // --- 2. Stream ---------------------------------------------------------
    yield { type: "status_change", status: "streaming" }

    let contentAccumulator = ""
    const deltaAccumulator: StreamDelta[] = []
    let finishReason: string | null = null

    try {
      for await (const chunk of parseSSEStream(response)) {
        if (signal.aborted) return

        for (const choice of chunk.choices) {
          if (choice.finish_reason) finishReason = choice.finish_reason

          const delta = choice.delta
          deltaAccumulator.push(delta)

          if (delta.content) {
            contentAccumulator += delta.content
            yield { type: "content_delta", content: delta.content }
          }
        }
      }
    } catch (error) {
      if (signal.aborted) return
      const msg = error instanceof Error ? error.message : String(error)
      yield { type: "error", error: `Stream error: ${msg}` }
      return
    }

    // --- 3. Handle finish reason -------------------------------------------
    if (finishReason === "tool_calls") {
      const toolCalls = assembleToolCalls(deltaAccumulator)

      // Append the assistant message that requested tool calls.
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: contentAccumulator || null,
        tool_calls: toolCalls,
      }
      conversation.push(assistantMsg)

      // Execute each tool and feed results back.
      yield { type: "status_change", status: "tool_executing" }

      for (const tc of toolCalls) {
        if (signal.aborted) return

        yield { type: "tool_call_start", toolCall: tc }

        const result = await executeTool(tc)

        yield { type: "tool_call_result", toolCallId: tc.id, name: tc.function.name, result }

        const toolMsg: ChatMessage = {
          role: "tool",
          content: result,
          tool_call_id: tc.id,
          name: tc.function.name,
        }
        conversation.push(toolMsg)
      }

      // Continue the loop so the model can process the tool results.
      continue
    }

    // finish_reason === "stop" (or any non-tool-calls reason) -- we are done.
    const finalMessage: ChatMessage = {
      role: "assistant",
      content: contentAccumulator || null,
    }
    yield { type: "message_complete", message: finalMessage }
    yield { type: "done" }
    return
  }

  // Iteration limit reached.
  yield { type: "error", error: "Agent loop exceeded maximum iterations." }
}
