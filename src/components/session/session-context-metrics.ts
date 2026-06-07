import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2/client"

type Provider = {
  id: string
  name?: string
  models: Record<string, Model | undefined>
}

type Model = {
  name?: string
  limit: {
    context: number
  }
}

type Context = {
  message: AssistantMessage
  provider?: Provider
  model?: Model
  providerLabel: string
  modelLabel: string
  limit: number | undefined
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
  total: number
  usage: number | null
}

type Metrics = {
  totalCost: number
  context: Context | undefined
}

const tokenTotal = (msg: AssistantMessage) => {
  const tokens = msg.tokens
  if (!tokens) return 0
  return tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
}

const lastAssistant = (messages: Message[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== "assistant") continue
    return msg
  }
}

const build = (messages: Message[] = [], providers: Provider[] = []): Metrics => {
  const totalCost = messages.reduce((sum, msg) => sum + (msg.role === "assistant" ? (msg.cost ?? 0) : 0), 0)
  const message = lastAssistant(messages)
  if (!message) return { totalCost, context: undefined }

  const provider = providers.find((item) => item.id === message.providerID)
  const model = provider?.models[message.modelID]
  const limit = model?.limit.context
  const tokens = message.tokens
  const total = tokenTotal(message)

  return {
    totalCost,
    context: {
      message,
      provider,
      model,
      providerLabel: provider?.name ?? message.providerID ?? "—",
      modelLabel: model?.name ?? message.modelID ?? "—",
      limit,
      input: tokens?.input ?? 0,
      output: tokens?.output ?? 0,
      reasoning: tokens?.reasoning ?? 0,
      cacheRead: tokens?.cache.read ?? 0,
      cacheWrite: tokens?.cache.write ?? 0,
      total,
      usage: limit ? Math.round((total / limit) * 100) : null,
    },
  }
}

export function getSessionContextMetrics(messages: Message[] = [], providers: Provider[] = []) {
  return build(messages, providers)
}
