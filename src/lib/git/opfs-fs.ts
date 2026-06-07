type FileData = string | ArrayBuffer | ArrayBufferView

type RuntimeDirectoryHandle = FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

function splitSegments(path: string): string[] {
  const normalized = normalizePath(path)
  return normalized ? normalized.split("/") : []
}

async function rootDirectory(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory()
}

async function getDirectory(path: string, create = false): Promise<FileSystemDirectoryHandle> {
  const segments = splitSegments(path)
  let current = await rootDirectory()

  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create })
  }

  return current
}

async function resolveEntry(path: string, createParent = false) {
  const segments = splitSegments(path)
  if (segments.length === 0) throw new Error("Path must point to a file or directory entry")

  const name = segments[segments.length - 1]
  const parent = await getDirectory(segments.slice(0, -1).join("/"), createParent)
  return { parent, name }
}

function statResult(input: { kind: "file" | "directory"; size?: number; mtimeMs?: number }) {
  const kind = input.kind
  return {
    type: kind,
    mode: kind === "directory" ? 0o040000 : 0o100644,
    size: input.size ?? 0,
    mtimeMs: input.mtimeMs ?? Date.now(),
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => false,
  }
}

function toWritableData(data: FileData): string | ArrayBuffer | ArrayBufferView {
  if (typeof data === "string") return data
  if (data instanceof ArrayBuffer) return data
  return data
}

async function readFile(path: string, options?: { encoding?: string } | string): Promise<string | Uint8Array> {
  const { parent, name } = await resolveEntry(path)
  const handle = await parent.getFileHandle(name)
  const file = await handle.getFile()
  const encoding = typeof options === "string" ? options : options?.encoding
  if (encoding) return await file.text()
  return new Uint8Array(await file.arrayBuffer())
}

async function writeFile(path: string, data: FileData): Promise<void> {
  const { parent, name } = await resolveEntry(path, true)
  const handle = await parent.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(toWritableData(data))
  await writable.close()
}

async function readdir(path: string, options?: { withFileTypes?: boolean }): Promise<any[]> {
  const dir = (await getDirectory(path)) as RuntimeDirectoryHandle
  const entries: any[] = []

  for await (const [name, handle] of dir) {
    if (options?.withFileTypes) {
      entries.push({
        name,
        isFile: () => handle.kind === "file",
        isDirectory: () => handle.kind === "directory",
        isSymbolicLink: () => false,
      })
    } else {
      entries.push(name)
    }
  }

  return entries.sort((a, b) => String(a.name ?? a).localeCompare(String(b.name ?? b)))
}

async function mkdir(path: string): Promise<void> {
  await getDirectory(path, true)
}

async function unlink(path: string): Promise<void> {
  const { parent, name } = await resolveEntry(path)
  await parent.removeEntry(name)
}

async function rmdir(path: string): Promise<void> {
  const { parent, name } = await resolveEntry(path)
  await parent.removeEntry(name, { recursive: true })
}

async function stat(path: string): Promise<ReturnType<typeof statResult>> {
  const segments = splitSegments(path)
  if (segments.length === 0) return statResult({ kind: "directory" })

  const { parent, name } = await resolveEntry(path)
  try {
    const fileHandle = await parent.getFileHandle(name)
    const file = await fileHandle.getFile()
    return statResult({ kind: "file", size: file.size, mtimeMs: file.lastModified })
  } catch {
    await parent.getDirectoryHandle(name)
    return statResult({ kind: "directory" })
  }
}

export const opfsGitFs = {
  promises: {
    readFile,
    writeFile,
    readdir,
    mkdir,
    unlink,
    rmdir,
    stat,
    lstat: stat,
    readlink: async () => {
      throw new Error("Symbolic links are not supported in the browser sandbox.")
    },
    symlink: async () => {
      throw new Error("Symbolic links are not supported in the browser sandbox.")
    },
  },
}
