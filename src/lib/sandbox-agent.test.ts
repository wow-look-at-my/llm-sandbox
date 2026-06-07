import { describe, expect, test } from "bun:test"
import { resolveSandboxAgentConfig } from "./sandbox-agent"

describe("resolveSandboxAgentConfig", () => {
  test("uses the selected prompt model before global config.model", () => {
    const result = resolveSandboxAgentConfig({
      model: { providerID: "xai", modelID: "grok-code-fast-1" },
      config: {
        provider: {
          xai: {
            options: {
              baseURL: "https://api.x.ai/v1",
            },
          },
        },
      },
      auth: {
        xai: {
          key: "xai-key",
        },
      },
    })

    expect(result).toEqual({
      baseUrl: "https://api.x.ai/v1",
      apiKey: "xai-key",
      model: "grok-code-fast-1",
    })
  })

  test("falls back to global config.model", () => {
    const result = resolveSandboxAgentConfig({
      config: {
        model: "openai/gpt-5-mini",
        provider: {
          openai: {
            options: {
              baseURL: "https://api.openai.com/v1",
            },
          },
        },
      },
      auth: {
        openai: {
          key: "openai-key",
        },
      },
    })

    expect(result).toEqual({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "openai-key",
      model: "gpt-5-mini",
    })
  })
})
