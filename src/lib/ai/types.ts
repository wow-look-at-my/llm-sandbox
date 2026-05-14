export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

export interface StreamDelta {
  role?: string
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}

export interface StreamChunk {
  id: string
  choices: Array<{
    index: number
    delta: StreamDelta
    finish_reason: string | null
  }>
}

export type AgentStatus = "idle" | "thinking" | "streaming" | "tool_executing" | "error"

export type AgentEvent =
  | { type: "status_change"; status: AgentStatus }
  | { type: "content_delta"; content: string }
  | { type: "tool_call_start"; toolCall: ToolCall }
  | { type: "tool_call_result"; toolCallId: string; name: string; result: string }
  | { type: "message_complete"; message: ChatMessage }
  | { type: "error"; error: string }
  | { type: "done" }
