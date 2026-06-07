import { describe, expect, test } from "bun:test"
import { browserProxyTarget } from "./agent-loop"

describe("browserProxyTarget", () => {
  test("routes remote provider requests through the browser CORS proxy", () => {
    const target = "https://api.x.ai/v1/chat/completions"

    expect(browserProxyTarget(target)).toBe(
      `https://proxy.pazer.ai/?url=${encodeURIComponent(target)}`,
    )
  })

  test("routes other remote provider requests through the browser CORS proxy", () => {
    const target = "https://api.openai.com/v1/chat/completions"

    expect(browserProxyTarget(target)).toBe(
      `https://proxy.pazer.ai/?url=${encodeURIComponent(target)}`,
    )
  })

  test("leaves local and proxy requests unchanged", () => {
    const target = "http://localhost:11434/v1/chat/completions"
    const proxy = "https://proxy.pazer.ai/?url=https%3A%2F%2Fapi.x.ai%2Fv1%2Fmodels"

    expect(browserProxyTarget(target)).toBe(target)
    expect(browserProxyTarget(proxy)).toBe(proxy)
  })
})
