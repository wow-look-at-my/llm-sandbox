import type { File, FileContent, FileNode } from "@opencode-ai/sdk/v2"
import * as opfs from "@/lib/opfs"

export type OpfsSdkHelpers = Pick<typeof opfs, "listDirectory" | "readFile" | "readTree" | "searchFiles">

type OpfsTreeNode = Awaited<ReturnType<typeof opfs.readTree>>

type FindFilesParams = {
  query?: string
  dirs?: "true" | "false" | boolean
  directory?: string
  limit?: number
  type?: "file" | "directory"
}

function normalizePath(path?: string): string {
  return (path ?? "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function joinPath(parent: string, name: string): string {
  const base = normalizePath(parent)
  return base ? `${base}/${name}` : name
}

function toClientPath(path: string): string {
  return normalizePath(path)
}

function toAbsolutePath(path: string): string {
  const normalized = normalizePath(path)
  return normalized ? `/${normalized}` : "/"
}

function includeDirectories(dirs: FindFilesParams["dirs"]) {
  return dirs === true || dirs === "true"
}

function matchesQuery(path: string, name: string, query: string) {
  if (!query) return true
  const normalized = query.toLocaleLowerCase()
  return path.toLocaleLowerCase().includes(normalized) || name.toLocaleLowerCase().includes(normalized)
}

function walkTree(
  node: OpfsTreeNode,
  visitor: (node: OpfsTreeNode, path: string) => void,
) {
  const path = toClientPath(node.path)
  visitor(node, path)
  for (const child of node.children ?? []) walkTree(child, visitor)
}

export function createOpfsSdkAdapter(helpers: OpfsSdkHelpers = opfs) {
  const list = async ({ path }: { path: string }) => {
    const directory = normalizePath(path)
    const entries = await helpers.listDirectory(directory)
    const nodes: FileNode[] = entries.map((entry) => {
      const childPath = joinPath(directory, entry.name)
      return {
        name: entry.name,
        path: childPath,
        absolute: toAbsolutePath(childPath),
        type: entry.kind,
        ignored: false,
      }
    })
    return { data: nodes }
  }

  const read = async ({ path }: { path: string }) => {
    const content = await helpers.readFile(path)
    const data: FileContent = { type: "text", content }
    return { data }
  }

  const status = async () => {
    // OPFS is the browser-backed source of truth in sandbox mode and has no VCS index.
    // Returning an empty list documents that no dirty-file status can be inferred safely.
    const data: File[] = []
    return { data }
  }

  const findFiles = async (params: FindFilesParams) => {
    const query = params.query ?? ""
    const directory = normalizePath(params.directory)
    const wantDirs = params.type === "directory" || (params.type !== "file" && includeDirectories(params.dirs))
    const wantFiles = params.type !== "directory"
    const limit = Math.max(0, params.limit ?? 100)
    const results = new Set<string>()

    const add = (path: string) => {
      if (limit > 0 && results.size >= limit) return
      const normalized = toClientPath(path)
      if (normalized) results.add(normalized)
    }

    const tree = await helpers.readTree(directory)
    walkTree(tree, (node, path) => {
      if (!path) return
      if (node.kind === "directory") {
        if (wantDirs && matchesQuery(path, node.name, query)) add(path)
        return
      }
      if (wantFiles && matchesQuery(path, node.name, query)) add(path)
    })

    if (wantFiles && query && (limit === 0 || results.size < limit)) {
      const matches = await helpers.searchFiles(query, directory)
      for (const match of matches) {
        if (limit > 0 && results.size >= limit) break
        add(match.path)
      }
    }

    return { data: Array.from(results).sort((a, b) => a.localeCompare(b)) }
  }

  return {
    file: {
      list,
      read,
      status,
    },
    find: {
      files: findFiles,
    },
  }
}
