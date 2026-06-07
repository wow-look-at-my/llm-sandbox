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

const emptyAssistantTokens = () => ({
  input: 0,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
})

function selectedModelKey(model: SelectedModel) {
  if (!model) return ""
  if (typeof model === "string") return model
  if (!model.providerID || !model.modelID) return ""
  return `${model.providerID}/${model.modelID}`
}

function selectedModelInfo(model: SelectedModel, fallback: string) {
  const modelStr = selectedModelKey(model) || fallback || ""
  const slashIdx = modelStr.indexOf("/")
  return {
    providerID: slashIdx > 0 ? modelStr.slice(0, slashIdx) : "",
    modelID: slashIdx > 0 ? modelStr.slice(slashIdx + 1) : modelStr,
  }
}

export function resolveSandboxAgentConfig(input: {
  config: Record<string, any>
  auth: Record<string, any>
  model?: SelectedModel
}): { baseUrl: string; apiKey: string; model: string } {
  const { providerID, modelID } = selectedModelInfo(input.model, input.config.model)

  const providerCfg = input.config.provider?.[providerID]
  const baseUrl: string = providerCfg?.options?.baseURL || ""
  const apiKey: string = input.auth[providerID]?.key || ""

  return { baseUrl, apiKey, model: modelID }
}

function getAgentConfig(model?: SelectedModel): {
  baseUrl: string
  apiKey: string
  model: string
  providerID: string
} {
  let config: Record<string, any> = {}
  let auth: Record<string, any> = {}
  try {
    config = JSON.parse(localStorage.getItem("opencode-global-config") || "{}")
  } catch {}
  try {
    auth = JSON.parse(localStorage.getItem("opencode-auth") || "{}")
  } catch {}

  return {
    ...resolveSandboxAgentConfig({ config, auth, model }),
    providerID: selectedModelInfo(model, config.model).providerID,
  }
}

export async function sendMessage(
  sessionId: string,
  content: string,
  options?: { agent?: string; messageID?: string; model?: SelectedModel },
) {
  const settings = getAgentConfig(options?.model)
  if (!settings.apiKey) {
    throw new Error("No provider configured. Open Settings > Providers to add one.")
  }

  const userMessageId = options?.messageID || crypto.randomUUID()
  const assistantMessageId = `${userMessageId}:assistant:${crypto.randomUUID()}`
  const userCreated = Date.now()
  const assistantCreated = userCreated + 1
  const agent = options?.agent || "build"

  const userMessage = {
    id: userMessageId,
    sessionID: sessionId,
    role: "user",
    time: { created: userCreated },
    agent,
    model: { providerID: settings.providerID, modelID: settings.model },
  }
  const assistantMessage = {
    id: assistantMessageId,
    sessionID: sessionId,
    role: "assistant",
    parentID: userMessageId,
    time: { created: assistantCreated },
    agent,
    providerID: settings.providerID,
    modelID: settings.model,
    mode: "primary",
    cost: 0,
    tokens: emptyAssistantTokens(),
  }

  const userParts = [
    { id: makePartId(), sessionID: sessionId, messageID: userMessageId, type: "text" as const, text: content },
  ]

  await db.addMessage(sessionId, {
    id: userMessageId,
    role: "user",
    parts: userParts,
    time: userMessage.time,
    metadata: userMessage,
  })

  emit({
    type: "message.updated",
    properties: { info: userMessage },
  })
  emit({
    type: "message.part.updated",
    properties: {
      sessionID: sessionId,
      messageID: userMessageId,
      part: userParts[0],
    },
  })
  emit({
    type: "message.updated",
    properties: { info: assistantMessage },
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
                sessionID: sessionId,
                messageID: assistantMessageId,
                type: "text",
                text: accumulatedText,
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
            sessionID: sessionId,
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
            const textPart = {
              id: currentTextPartId,
              sessionID: sessionId,
              messageID: assistantMessageId,
              type: "text",
              text: accumulatedText,
            }
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
          const errorPart = {
            id: errorPartId,
            sessionID: sessionId,
            messageID: assistantMessageId,
            type: "text",
            text: `Error: ${event.error}`,
          }
          assistantParts.push(errorPart)
          emit({
            type: "message.part.updated",
            properties: {
              sessionID: sessionId,
              messageID: assistantMessageId,
              part: errorPart,
            },
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
    assistantParts.push({
      id: currentTextPartId,
      sessionID: sessionId,
      messageID: assistantMessageId,
      type: "text",
      text: accumulatedText,
    })
  }

  const completedAssistantMessage = {
    ...assistantMessage,
    time: { ...assistantMessage.time, completed: Date.now() },
  }

  await db.addMessage(sessionId, {
    id: assistantMessageId,
    role: "assistant",
    parts: assistantParts,
    time: completedAssistantMessage.time,
    metadata: completedAssistantMessage,
  })

  emit({
    type: "message.updated",
    properties: { info: completedAssistantMessage },
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
