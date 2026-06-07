import { describe, expect, test } from "bun:test"
import { normalizeAgentList } from "@/context/global-sync/utils"
import { createSandboxClient } from "./sandbox-sdk"

describe("createSandboxClient", () => {
  test("returns a default agent accepted by agent normalization", async () => {
    const client = createSandboxClient()
    const response = await client.app.agents()

    expect(normalizeAgentList(response.data)).toEqual([
      {
        name: "build",
        mode: "primary",
        permission: {},
        options: {},
      },
    ])
  })
})
