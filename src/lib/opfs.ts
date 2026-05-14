export interface TreeNode {
  name: string
  kind: "file" | "directory"
  path: string
  children?: TreeNode[]
}

type DirectoryEntry = [string, FileSystemDirectoryHandle | FileSystemFileHandle]

function directoryEntries(dir: FileSystemDirectoryHandle): AsyncIterable<DirectoryEntry> {
  // FileSystemDirectoryHandle implements AsyncIterable<[string, FileSystemHandle]>
  // at runtime, but TypeScript's DOM lib does not include the .entries() method.
  // Cast to the runtime-available async iterable interface.
  return dir as unknown as AsyncIterable<DirectoryEntry>
}

function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function splitSegments(path: string): string[] {
  const normalized = normalizePath(path)
  if (normalized === "") return []
  return normalized.split("/")
}

async function resolvePath(
  path: string,
  create?: boolean,
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const segments = splitSegments(path)
  if (segments.length === 0) {
    throw new Error("Cannot resolve empty path to a file or directory entry")
  }

  const root = await navigator.storage.getDirectory()
  let current = root

  for (let i = 0; i < segments.length - 1; i++) {
    try {
      current = await current.getDirectoryHandle(segments[i], { create: !!create })
    } catch (error) {
      throw new Error(
        `Failed to access directory "${segments.slice(0, i + 1).join("/")}": ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return { parent: current, name: segments[segments.length - 1] }
}

async function resolveDirectory(path: string): Promise<FileSystemDirectoryHandle> {
  const segments = splitSegments(path)
  if (segments.length === 0) {
    return await navigator.storage.getDirectory()
  }

  const root = await navigator.storage.getDirectory()
  let current = root

  for (let i = 0; i < segments.length; i++) {
    try {
      current = await current.getDirectoryHandle(segments[i])
    } catch (error) {
      throw new Error(
        `Directory not found: "/${segments.slice(0, i + 1).join("/")}": ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return current
}

export async function readFile(path: string): Promise<string> {
  const { parent, name } = await resolvePath(path)
  let handle: FileSystemFileHandle
  try {
    handle = await parent.getFileHandle(name)
  } catch (error) {
    throw new Error(
      `File not found: "/${normalizePath(path)}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const file = await handle.getFile()
  return await file.text()
}

export async function writeFile(path: string, content: string): Promise<void> {
  const { parent, name } = await resolvePath(path, true)
  const handle = await parent.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function editFile(
  path: string,
  oldString: string,
  newString: string,
): Promise<{ success: boolean; error?: string }> {
  let content: string
  try {
    content = await readFile(path)
  } catch (error) {
    return {
      success: false,
      error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  if (!content.includes(oldString)) {
    return {
      success: false,
      error: `String not found in file "/${normalizePath(path)}"`,
    }
  }

  const updated = content.replace(oldString, newString)
  try {
    await writeFile(path, updated)
  } catch (error) {
    return {
      success: false,
      error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  return { success: true }
}

export async function deleteFile(path: string): Promise<void> {
  const { parent, name } = await resolvePath(path)
  try {
    await parent.removeEntry(name)
  } catch (error) {
    throw new Error(
      `Failed to delete file "/${normalizePath(path)}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function deleteDirectory(path: string): Promise<void> {
  const { parent, name } = await resolvePath(path)
  try {
    await parent.removeEntry(name, { recursive: true })
  } catch (error) {
    throw new Error(
      `Failed to delete directory "/${normalizePath(path)}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export async function listDirectory(
  path: string,
): Promise<Array<{ name: string; kind: "file" | "directory" }>> {
  const dir = await resolveDirectory(path)
  const entries: Array<{ name: string; kind: "file" | "directory" }> = []

  for await (const [name, handle] of directoryEntries(dir)) {
    entries.push({ name, kind: handle.kind })
  }

  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return entries
}

export async function readTree(path?: string): Promise<TreeNode> {
  const resolvedPath = normalizePath(path ?? "")
  const dir = await resolveDirectory(resolvedPath)
  const fullPath = resolvedPath === "" ? "/" : `/${resolvedPath}`

  return buildTreeNode(dir, dir.name || "/", fullPath)
}

async function buildTreeNode(
  handle: FileSystemDirectoryHandle,
  name: string,
  currentPath: string,
): Promise<TreeNode> {
  const children: TreeNode[] = []

  for await (const [entryName, entryHandle] of directoryEntries(handle)) {
    const entryPath = currentPath === "/" ? `/${entryName}` : `${currentPath}/${entryName}`

    if (entryHandle.kind === "directory") {
      const child = await buildTreeNode(
        entryHandle as FileSystemDirectoryHandle,
        entryName,
        entryPath,
      )
      children.push(child)
    } else {
      children.push({
        name: entryName,
        kind: "file",
        path: entryPath,
      })
    }
  }

  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    name,
    kind: "directory",
    path: currentPath,
    children,
  }
}

export async function exists(path: string): Promise<boolean> {
  const segments = splitSegments(path)
  if (segments.length === 0) return true

  try {
    const { parent, name } = await resolvePath(path)
    try {
      await parent.getFileHandle(name)
      return true
    } catch {
      // Not a file, try as directory
    }
    try {
      await parent.getDirectoryHandle(name)
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

export async function searchFiles(
  pattern: string,
  basePath?: string,
): Promise<Array<{ path: string; line: number; content: string }>> {
  const resolvedBase = normalizePath(basePath ?? "")
  const dir = await resolveDirectory(resolvedBase)
  const prefix = resolvedBase === "" ? "/" : `/${resolvedBase}`
  const results: Array<{ path: string; line: number; content: string }> = []
  const MAX_RESULTS = 100

  await searchDirectory(dir, prefix, pattern, results, MAX_RESULTS)

  return results
}

async function searchDirectory(
  dir: FileSystemDirectoryHandle,
  currentPath: string,
  pattern: string,
  results: Array<{ path: string; line: number; content: string }>,
  maxResults: number,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (results.length >= maxResults) return

    const entryPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`

    if (handle.kind === "directory") {
      await searchDirectory(
        handle as FileSystemDirectoryHandle,
        entryPath,
        pattern,
        results,
        maxResults,
      )
    } else {
      try {
        const fileHandle = handle as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const text = await file.text()
        const lines = text.split("\n")

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= maxResults) return
          if (lines[i].includes(pattern)) {
            results.push({
              path: entryPath,
              line: i + 1,
              content: lines[i],
            })
          }
        }
      } catch {
        // Skip files that cannot be read
      }
    }
  }
}
