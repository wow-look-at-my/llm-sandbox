import type { Terminal as Term } from "ghostty-web"
import type { Directory as WasmerDirectory, Instance as WasmerInstance, Runtime as WasmerRuntime } from "@wasmer/sdk"
import wasmerSdkEntryUrl from "@wasmer/sdk/index.mjs?url"
import wasmerSDKUrl from "@wasmer/sdk/wasm?url"
import wasmerWorkerUrl from "@wasmer/sdk/worker.mjs?url"
import * as opfs from "@/lib/opfs"

type WasmerSdk = typeof import("@wasmer/sdk")
type Write = (data: string | Uint8Array) => Promise<void>

type WasmerTerminalOptions = {
  term: Term
  write: Write
  onConnect?: () => void
  onConnectError?: (error: unknown) => void
  onSubmit?: () => void
}

type OpfsTreeNode = Awaited<ReturnType<typeof opfs.readTree>>

const PACKAGE = "sharrattj/bash"
const MOUNT = "/workspace"

let runtime: WasmerRuntime | undefined
let sdkPackage: Promise<WasmerSdk> | undefined
let bashPackage: Promise<Awaited<ReturnType<WasmerSdk["Wasmer"]["fromRegistry"]>>> | undefined

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

async function ensureWasmer() {
  if (!crossOriginIsolated) {
    throw new Error(
      "Wasmer requires cross-origin isolation. Serve the app with COOP/COEP headers to enable SharedArrayBuffer.",
    )
  }
  sdkPackage ??= import("@wasmer/sdk").then(async (sdk) => {
    await sdk.init({
      module: wasmerSDKUrl,
      sdkUrl: wasmerSdkEntryUrl,
      workerUrl: wasmerWorkerUrl,
    })
    return sdk
  })
  const sdk = await sdkPackage
  runtime ??= new sdk.Runtime({})
  bashPackage ??= sdk.Wasmer.fromRegistry(PACKAGE, runtime)
  return { Directory: sdk.Directory, pkg: await bashPackage }
}

async function createDirectoryFromOpfs(Directory: WasmerSdk["Directory"]) {
  const directory = new Directory()
  const root = await opfs.readTree()

  async function addNode(node: OpfsTreeNode) {
    for (const child of node.children ?? []) {
      const path = normalizePath(child.path)
      if (!path) continue
      if (child.kind === "directory") {
        await directory.createDir(path).catch(() => {})
        await addNode(child)
        continue
      }
      await directory.writeFile(path, await opfs.readFile(path))
    }
  }

  await addNode(root)
  return directory
}

async function collectOpfsPaths() {
  const root = await opfs.readTree()
  const files = new Set<string>()
  const dirs = new Set<string>()

  function visit(node: OpfsTreeNode) {
    for (const child of node.children ?? []) {
      const path = normalizePath(child.path)
      if (!path) continue
      if (child.kind === "directory") {
        dirs.add(path)
        visit(child)
      } else {
        files.add(path)
      }
    }
  }

  visit(root)
  return { files, dirs }
}

async function collectWasmerPaths(directory: WasmerDirectory) {
  const files = new Set<string>()
  const dirs = new Set<string>()

  async function visit(path: string) {
    const entries = await directory.readDir(path || ".").catch(() => [])
    for (const entry of entries) {
      const next = normalizePath(path ? `${path}/${entry.name}` : entry.name)
      if (!next) continue
      if (entry.type === "dir") {
        dirs.add(next)
        await visit(next)
      } else if (entry.type === "file") {
        files.add(next)
      }
    }
  }

  await visit("")
  return { files, dirs }
}

async function syncDirectoryToOpfs(directory: WasmerDirectory, before: Awaited<ReturnType<typeof collectOpfsPaths>>) {
  const after = await collectWasmerPaths(directory)

  for (const file of after.files) {
    await opfs.writeFile(file, await directory.readTextFile(file))
  }

  const removedFiles = Array.from(before.files).filter((path) => !after.files.has(path))
  for (const file of removedFiles) {
    await opfs.deleteFile(file).catch(() => {})
  }

  const removedDirs = Array.from(before.dirs)
    .filter((path) => !after.dirs.has(path))
    .sort((a, b) => b.length - a.length)
  for (const dir of removedDirs) {
    await opfs.deleteDirectory(dir).catch(() => {})
  }

  return after
}

function pipeReadable(input: ReadableStream<Uint8Array>, write: Write, signal: AbortSignal) {
  const controller = new AbortController()

  const abort = () => controller.abort()
  signal.addEventListener("abort", abort, { once: true })

  void input.pipeTo(
    new WritableStream<Uint8Array>({
      write: (chunk) => write(chunk),
    }),
    { signal: controller.signal },
  ).catch((error) => {
    if (!signal.aborted) console.error("[wasmer-terminal] stream failed", error)
  })

  return () => {
    signal.removeEventListener("abort", abort)
    controller.abort()
  }
}

export function connectWasmerTerminal(options: WasmerTerminalOptions) {
  const abort = new AbortController()
  const encoder = new TextEncoder()
  let instance: WasmerInstance | undefined
  let stdin: WritableStreamDefaultWriter<Uint8Array> | undefined
  let workspace: WasmerDirectory | undefined
  let snapshot: Awaited<ReturnType<typeof collectOpfsPaths>> | undefined
  let syncTimer: ReturnType<typeof setTimeout> | undefined
  let syncing = false
  const cleanups: VoidFunction[] = []

  const write = async (data: string) => {
    if (abort.signal.aborted) return
    await options.write(data)
  }

  const scheduleSync = () => {
    if (syncTimer !== undefined) clearTimeout(syncTimer)
    syncTimer = setTimeout(() => {
      syncTimer = undefined
      if (!workspace || !snapshot || syncing || abort.signal.aborted) return
      syncing = true
      syncDirectoryToOpfs(workspace, snapshot)
        .then((next) => {
          snapshot = next
        })
        .catch((error) => console.error("[wasmer-terminal] OPFS sync failed", error))
        .finally(() => {
          syncing = false
        })
    }, 600)
  }

  const dataSubscription = options.term.onData((data) => {
    if (data.includes("\r") || data.includes("\n")) {
      options.onSubmit?.()
      scheduleSync()
    }
    stdin?.write(encoder.encode(data)).catch((error) => {
      if (!abort.signal.aborted) console.error("[wasmer-terminal] stdin failed", error)
    })
  })
  cleanups.push(() => dataSubscription.dispose())

  void (async () => {
    await write("Starting Wasmer bash...\r\n")
    try {
      await write("Loading Wasmer runtime...\r\n")
      const { Directory, pkg } = await ensureWasmer()
      await write(`Loaded ${PACKAGE}.\r\n`)
      const entrypoint = pkg.entrypoint
      if (!entrypoint) throw new Error(`${PACKAGE} does not expose an entrypoint.`)

      await write("Mounting OPFS workspace...\r\n")
      snapshot = await collectOpfsPaths()
      workspace = await createDirectoryFromOpfs(Directory)
      await write("Launching shell...\r\n")
      instance = await entrypoint.run({
        cwd: MOUNT,
        env: {
          HOME: MOUNT,
          PS1: "wasmer:\\w$ ",
        },
        mount: {
          [MOUNT]: workspace,
        },
      })

      stdin = instance.stdin?.getWriter()
      await write(stdin ? "stdin connected.\r\n" : "stdin unavailable.\r\n")
      cleanups.push(pipeReadable(instance.stdout, write, abort.signal))
      cleanups.push(pipeReadable(instance.stderr, write, abort.signal))
      await write("Shell streams connected.\r\n")
      options.onConnect?.()
    } catch (error) {
      options.onConnectError?.(error)
      await write(`${error instanceof Error ? error.message : String(error)}\r\n`)
    }
  })()

  return () => {
    abort.abort()
    if (syncTimer !== undefined) clearTimeout(syncTimer)
    for (const cleanup of cleanups.reverse()) cleanup()
    stdin?.close().catch(() => {})
    if (workspace && snapshot) {
      syncDirectoryToOpfs(workspace, snapshot).catch((error) => console.error("[wasmer-terminal] OPFS sync failed", error))
    }
  }
}
