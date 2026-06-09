import { describe, expect, test } from "bun:test"
import type { Agent, Project } from "@opencode-ai/sdk/v2/client"
import { directoryKey, normalizeAgentList, normalizeProject } from "./utils"

const agent = (name = "build") =>
  ({
    name,
    mode: "primary",
    permission: {},
    options: {},
  }) as Agent

describe("normalizeAgentList", () => {
  test("keeps array payloads", () => {
    expect(normalizeAgentList([agent("build"), agent("docs")])).toEqual([agent("build"), agent("docs")])
  })

  test("wraps a single agent payload", () => {
    expect(normalizeAgentList(agent("docs"))).toEqual([agent("docs")])
  })

  test("extracts agents from keyed objects", () => {
    expect(
      normalizeAgentList({
        build: agent("build"),
        docs: agent("docs"),
      }),
    ).toEqual([agent("build"), agent("docs")])
  })

  test("drops invalid payloads", () => {
    expect(normalizeAgentList({ name: "AbortError" })).toEqual([])
    expect(normalizeAgentList([{ name: "build" }, agent("docs")])).toEqual([agent("docs")])
  })
})

describe("normalizeProject", () => {
  test("keeps valid projects and strips transient icon URLs", () => {
    const project = {
      id: "proj_1",
      worktree: "/repo/app",
      sandboxes: ["/repo/app-a"],
      icon: {
        url: "https://example.com/icon.png",
        override: "custom",
        color: "blue",
      },
    } as Project

    expect(normalizeProject(project)).toEqual({
      id: "proj_1",
      worktree: "/repo/app",
      sandboxes: ["/repo/app-a"],
      icon: {
        url: undefined,
        override: undefined,
        color: "blue",
      },
    })
  })

  test("drops malformed project payloads before string operations", () => {
    expect(normalizeProject({ id: "proj_1", worktree: { path: "/repo/app" } })).toBeUndefined()
    expect(normalizeProject({ id: "proj_1", worktree: null })).toBeUndefined()
    expect(normalizeProject({ id: 1, worktree: "/repo/app" })).toBeUndefined()
  })

  test("keeps only string sandbox directories", () => {
    expect(
      normalizeProject({
        id: "proj_1",
        worktree: "/repo/app",
        sandboxes: ["/repo/app-a", { path: "/repo/app-b" }, null],
      }),
    ).toMatchObject({
      id: "proj_1",
      worktree: "/repo/app",
      sandboxes: ["/repo/app-a"],
    })
  })
})

describe("directoryKey", () => {
  test("normalizes slashes", () => {
    expect(String(directoryKey("C:\\Repos\\sst\\opencode"))).toBe("C:/Repos/sst/opencode")
    expect(String(directoryKey("C:/Repos/sst/opencode"))).toBe("C:/Repos/sst/opencode")
  })

  test("preserves backslashes in posix paths", () => {
    expect(String(directoryKey("/tmp/foo\\bar"))).toBe("/tmp/foo\\bar")
  })

  test("trims trailing slashes without breaking roots", () => {
    expect(String(directoryKey("C:/Repos/sst/opencode/"))).toBe("C:/Repos/sst/opencode")
    expect(String(directoryKey("C:/"))).toBe("C:/")
    expect(String(directoryKey("/"))).toBe("/")
  })
})
