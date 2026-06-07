import { describe, expect, test } from "bun:test"
import { browserProxyTarget } from "./agent-loop"

describe("browserProxyTarget", () => {
  test("routes xAI requests through the browser CORS proxy", () => {
    const target = "https://api.x.ai/v1/chat/completions"

    expect(browserProxyTarget(target)).toBe(
      `https://proxy.pazer.ai/?url=${encodeURIComponent(target)}`,
    )
  })

  test("leaves other provider requests unchanged", () => {
    const target = "https://api.openai.com/v1/chat/completions"

    expect(browserProxyTarget(target)).toBe(target)
  })
})
