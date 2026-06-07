import { describe, expect, test } from "bun:test"
import { formatSandboxMessagesResponse } from "@/lib/sandbox-message-format"

describe("sandbox session.messages response", () => {
  test("fetchMessages-style logic receives persisted user and assistant messages with normalized parts", () => {
    const sessionID = "ses_1"
    const response = formatSandboxMessagesResponse(
      [
        {
          sessionId: sessionID,
          id: "msg_user",
          role: "user",
          parts: [{ id: "part_user", type: "text", text: "hello" }],
          time: { created: 1 },
        },
        {
          sessionId: sessionID,
          id: "msg_assistant",
          role: "assistant",
          parts: [{ id: "part_assistant", type: "text", text: "hi there" }],
          time: { created: 2, completed: 3 },
        },
      ],
      { sessionID, limit: 80 },
    )

    const items = (response.data ?? []).filter((item) => !!item?.info?.id)
    const messages = items.map((item) => item.info)
    const parts = items.map((message) => ({ id: message.info.id, part: message.parts }))
    const cursor = response.response.headers.get("x-next-cursor") ?? undefined

    expect(messages).toHaveLength(2)
    expect(messages).toEqual([
      expect.objectContaining({ id: "msg_user", sessionID, role: "user", time: { created: 1 } }),
      expect.objectContaining({ id: "msg_assistant", sessionID, role: "assistant", time: { created: 2, completed: 3 } }),
    ])
    expect(parts).toEqual([
      { id: "msg_user", part: [expect.objectContaining({ id: "part_user", sessionID, messageID: "msg_user" })] },
      {
        id: "msg_assistant",
        part: [expect.objectContaining({ id: "part_assistant", sessionID, messageID: "msg_assistant" })],
      },
    ])
    expect(cursor).toBeUndefined()
  })
})
