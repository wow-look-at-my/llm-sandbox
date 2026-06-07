import { describe, expect, test } from "bun:test"
import { createOpfsSdkAdapter, type OpfsSdkHelpers } from "./global-sdk-opfs"

const helpers: OpfsSdkHelpers = {
  listDirectory: async (path) => {
    expect(path).toBe("src")
    return [
      { name: "context", kind: "directory" },
      { name: "main.tsx", kind: "file" },
    ]
  },
  readFile: async (path) => {
    expect(path).toBe("src/main.tsx")
    return "export default 'hello'\n"
  },
  readTree: async () => ({
    name: "/",
    kind: "directory",
    path: "/",
    children: [
      {
        name: "src",
        kind: "directory",
        path: "/src",
        children: [
          { name: "main.tsx", kind: "file", path: "/src/main.tsx" },
          { name: "review-tab.tsx", kind: "file", path: "/src/pages/session/review-tab.tsx" },
        ],
      },
      { name: "README.md", kind: "file", path: "/README.md" },
    ],
  }),
  searchFiles: async (pattern) => {
    if (pattern !== "SessionReview") return []
    return [{ path: "/src/pages/session/review-tab.tsx", line: 1, content: "<SessionReview />" }]
  },
}

describe("createOpfsSdkAdapter", () => {
  test("maps OPFS directory entries to FileNode values consumed by the tree store", async () => {
    const adapter = createOpfsSdkAdapter(helpers)

    await expect(adapter.file.list({ path: "/src/" })).resolves.toEqual({
      data: [
        { name: "context", path: "src/context", absolute: "/src/context", type: "directory", ignored: false },
        { name: "main.tsx", path: "src/main.tsx", absolute: "/src/main.tsx", type: "file", ignored: false },
      ],
    })
  })

  test("maps OPFS text reads to FileContent values consumed by file views and review reads", async () => {
    const adapter = createOpfsSdkAdapter(helpers)

    await expect(adapter.file.read({ path: "src/main.tsx" })).resolves.toEqual({
      data: { type: "text", content: "export default 'hello'\n" },
    })
  })

  test("returns a documented empty status because OPFS has no VCS index", async () => {
    const adapter = createOpfsSdkAdapter(helpers)

    await expect(adapter.file.status()).resolves.toEqual({ data: [] })
  })

  test("finds files and optional directories from OPFS tree traversal", async () => {
    const adapter = createOpfsSdkAdapter(helpers)

    await expect(adapter.find.files({ query: "src", dirs: "true" })).resolves.toEqual({
      data: ["src", "src/main.tsx", "src/pages/session/review-tab.tsx"],
    })
    await expect(adapter.find.files({ query: "main", dirs: "false" })).resolves.toEqual({
      data: ["src/main.tsx"],
    })
  })

  test("adds content search matches so review mention pickers can see files whose contents match", async () => {
    const adapter = createOpfsSdkAdapter(helpers)

    await expect(adapter.find.files({ query: "SessionReview", dirs: "false" })).resolves.toEqual({
      data: ["src/pages/session/review-tab.tsx"],
    })
  })
})
