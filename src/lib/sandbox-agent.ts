import { runAgentLoop } from "./ai/agent-loop"
import { SYSTEM_PROMPT } from "./ai/system-prompt"
import type { ChatMessage, AgentEvent } from "./ai/types"
import { emitSandboxEvent } from "./sandbox-events"
import * as db from "./db"

let currentAbort: AbortController | null = null

type SelectedModel =
  | string
  | {
      providerID?: string
      modelID?: string
    }
  | undefined

function emit(event: unknown) {
  emitSandboxEvent(event)
}

function makePartId() {
  return crypto.randomUUID()
}

function selectedModelKey(model: SelectedModel) {
  if (!model) return ""
  if (typeof model === "string") return model
  if (!model.providerID || !model.modelID) return ""
  return `${model.providerID}/${model.modelID}`
}

export function resolveSandboxAgentConfig(input: {
  config: Record<string, any>
  auth: Record<string, any>
  model?: SelectedModel
}): { baseUrl: string; apiKey: string; model: string } {
  const modelStr: string = selectedModelKey(input.model) || input.config.model || ""
  const slashIdx = modelStr.indexOf("/")
  const providerID = slashIdx > 0 ? modelStr.slice(0, slashIdx) : ""
  const modelID = slashIdx > 0 ? modelStr.slice(slashIdx + 1) : modelStr

  const providerCfg = input.config.provider?.[providerID]
  const baseUrl: string = providerCfg?.options?.baseURL || ""
  const apiKey: string = input.auth[providerID]?.key || ""

  return { baseUrl, apiKey, model: modelID }
}

function getAgentConfig(model?: SelectedModel): { baseUrl: string; apiKey: string; model: string } {
  let config: Record<string, any> = {}
  let auth: Record<string, any> = {}
  try {
    config = JSON.parse(localStorage.getItem("opencode-global-config") || "{}")
  } catch {}
  try {
    auth = JSON.parse(localStorage.getItem("opencode-auth") || "{}")
  } catch {}

  return resolveSandboxAgentConfig({ config, auth, model })
}

export async function sendMessage(sessionId: string, content: string, options?: { model?: SelectedModel }) {
  const settings = getAgentConfig(options?.model)
  if (!settings.apiKey) {
    throw new Error("No provider configured. Open Settings > Providers to add one.")
  }

  const userMessageId = crypto.randomUUID()
  const assistantMessageId = crypto.randomUUID()

  const userParts = [{ id: makePartId(), type: "text" as const, text: content }]

  await db.addMessage(sessionId, {
    id: userMessageId,
    role: "user",
    parts: userParts,
    time: { created: Date.now() },
  })

  emit({
    type: "message.part.updated",
    properties: {
      sessionID: sessionId,
      messageID: userMessageId,
      part: { id: userParts[0].id, type: "text", text: content, messageID: userMessageId },
    },
  })

  emit({
    type: "session.status",
    properties: { sessionID: sessionId, status: { type: "busy" } },
  })

  const existingMessages = await db.getMessages(sessionId)
  const chatHistory: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ]

  for (const msg of existingMessages) {
    if (msg.role === "user") {
      const textParts = (msg.parts as any[]).filter((p: any) => p.type === "text")
      const text = textParts.map((p: any) => p.text || p.content || "").join("\n")
      if (text) chatHistory.push({ role: "user", content: text })
    } else if (msg.role === "assistant") {
      const textParts = (msg.parts as any[]).filter((p: any) => p.type === "text")
      const text = textParts.map((p: any) => p.text || p.content || "").join("\n")
      if (text) chatHistory.push({ role: "assistant", content: text })
    }
  }

  currentAbort = new AbortController()
  const signal = currentAbort.signal

  const assistantParts: any[] = []
  let currentTextPartId = makePartId()
  let accumulatedText = ""

  try {
    for await (const event of runAgentLoop(
      { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
      chatHistory,
      sessionId,
      signal,
    )) {
      if (signal.aborted) break

      switch (event.type) {
        case "content_delta": {
          accumulatedText += event.content
          emit({
            type: "message.part.updated",
            properties: {
              sessionID: sessionId,
              messageID: assistantMessageId,
              part: {
                id: currentTextPartId,
                type: "text",
                text: accumulatedText,
                messageID: assistantMessageId,
              },
            },
          })
          break
        }

        case "tool_call_start": {
          const toolPartId = makePartId()
          const toolPart = {
            id: toolPartId,
            type: "tool-invocation",
            tool: event.toolCall.function.name,
            state: "running",
            args: tryParseJSON(event.toolCall.function.arguments),
            messageID: assistantMessageId,
          }
          assistantParts.push(toolPart)
          emit({
            type: "message.part.updated",
            properties: {
              sessionID: sessionId,
              messageID: assistantMessageId,
              part: toolPart,
            },
          })
          break
        }

        case "tool_call_result": {
          const existing = assistantParts.find(
            (p: any) => p.type === "tool-invocation" && p.tool === event.name,
          )
          if (existing) {
            existing.state = "completed"
            existing.result = event.result
            emit({
              type: "message.part.updated",
              properties: {
                sessionID: sessionId,
                messageID: assistantMessageId,
                part: { ...existing },
              },
            })
          }
          break
        }

        case "message_complete": {
          if (accumulatedText) {
            const textPart = { id: currentTextPartId, type: "text", text: accumulatedText }
            const idx = assistantParts.findIndex((p: any) => p.id === currentTextPartId)
            if (idx >= 0) {
              assistantParts[idx] = textPart
            } else {
              assistantParts.push(textPart)
            }
          }
          break
        }

        case "error": {
          const errorPartId = makePartId()
          assistantParts.push({
            id: errorPartId,
            type: "text",
            text: `Error: ${event.error}`,
          })
          emit({
            type: "session.error",
            properties: {
              sessionID: sessionId,
              error: { name: "UnknownError", data: { message: event.error } },
            },
          })
          break
        }

        case "done": {
          break
        }
      }
    }
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      emit({
        type: "session.error",
        properties: {
          sessionID: sessionId,
          error: { name: "UnknownError", data: { message: String(err) } },
        },
      })
    }
  }

  if (assistantParts.length === 0 && accumulatedText) {
    assistantParts.push({ id: currentTextPartId, type: "text", text: accumulatedText })
  }

  await db.addMessage(sessionId, {
    id: assistantMessageId,
    role: "assistant",
    parts: assistantParts,
    time: { created: Date.now(), completed: Date.now() },
  })

  emit({
    type: "session.status",
    properties: { sessionID: sessionId, status: { type: "idle" } },
  })

  emit({
    type: "session.idle",
    properties: { sessionID: sessionId },
  })

  currentAbort = null
}

export function abortCurrentSession() {
  currentAbort?.abort()
  currentAbort = null
}

function tryParseJSON(str: string): unknown {
  try {
    return JSON.parse(str)
  } catch {
    return str
  }
}
