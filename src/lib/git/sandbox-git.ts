import git from "isomorphic-git"
import http from "isomorphic-git/http/web"
import { opfsGitFs } from "./opfs-fs"
import { requestSandboxPermission } from "@/lib/sandbox-permissions"

const PUSH_APPROVAL_KEY = "opencode-sandbox-git-push-approvals.v1"

type AuthArgs = {
  username?: string
  password?: string
  token?: string
}

type PushApproval = {
  dir: string
  remote: string
  branch: string
  url: string
  force: boolean
}

function normalizeDir(dir: string): string {
  const normalized = dir.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "")
  if (!normalized || normalized === "/") return "/"
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

function authCallback(args: AuthArgs) {
  if (args.token) return () => ({ username: args.username || args.token, password: args.token })
  if (args.username || args.password) return () => ({ username: args.username, password: args.password })
  return undefined
}

function sanitizeRemoteUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    return url.toString()
  } catch {
    return value.replace(/\/\/[^/@]+@/, "//")
  }
}

function loadApprovals(): PushApproval[] {
  if (typeof localStorage === "undefined") return []
  try {
    const value = JSON.parse(localStorage.getItem(PUSH_APPROVAL_KEY) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function saveApprovals(approvals: PushApproval[]) {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(PUSH_APPROVAL_KEY, JSON.stringify(approvals))
}

function sameApproval(a: PushApproval, b: PushApproval): boolean {
  return a.dir === b.dir && a.remote === b.remote && a.branch === b.branch && a.url === b.url && a.force === b.force
}

function hasAlwaysApproval(target: PushApproval): boolean {
  return loadApprovals().some((approval) => sameApproval(approval, target))
}

function rememberApproval(target: PushApproval) {
  const approvals = loadApprovals()
  if (approvals.some((approval) => sameApproval(approval, target))) return
  approvals.push(target)
  saveApprovals(approvals)
}

async function currentBranch(dir: string): Promise<string> {
  const branch = await git.currentBranch({ fs: opfsGitFs, dir, fullname: false })
  if (!branch) throw new Error(`No current branch in ${dir}. Check out a branch before committing or pushing.`)
  return branch
}

async function remoteUrl(dir: string, remote: string): Promise<string> {
  const value = await git.getConfig({ fs: opfsGitFs, dir, path: `remote.${remote}.url` })
  if (!value) throw new Error(`Remote "${remote}" is not configured in ${dir}.`)
  return sanitizeRemoteUrl(value)
}

async function stageAll(dir: string, paths?: string[]) {
  if (paths?.length) {
    for (const filepath of paths) {
      await git.add({ fs: opfsGitFs, dir, filepath })
    }
    return
  }

  const matrix = await git.statusMatrix({ fs: opfsGitFs, dir })
  for (const [filepath, head, workdir] of matrix) {
    if (head === 1 && workdir === 0) {
      await git.remove({ fs: opfsGitFs, dir, filepath })
    } else if (workdir !== 0) {
      await git.add({ fs: opfsGitFs, dir, filepath })
    }
  }
}

export async function gitClone(args: {
  url: string
  dir: string
  ref?: string
  depth?: number
  singleBranch?: boolean
} & AuthArgs): Promise<string> {
  const dir = normalizeDir(args.dir)
  await git.clone({
    fs: opfsGitFs,
    http,
    dir,
    url: args.url,
    ref: args.ref,
    depth: args.depth ?? 1,
    singleBranch: args.singleBranch ?? true,
    corsProxy: undefined,
    onAuth: authCallback(args),
  })
  return `Cloned ${sanitizeRemoteUrl(args.url)} into ${dir}.`
}

export async function gitStatus(args: { dir: string }): Promise<string> {
  const dir = normalizeDir(args.dir)
  const [branch, branches, matrix] = await Promise.all([
    git.currentBranch({ fs: opfsGitFs, dir, fullname: false }),
    git.listBranches({ fs: opfsGitFs, dir }).catch(() => []),
    git.statusMatrix({ fs: opfsGitFs, dir }),
  ])

  const changed = matrix.filter(([, head, workdir, stage]) => head !== workdir || workdir !== stage)
  const files = changed.map(([filepath, head, workdir, stage]) => {
    return `${filepath} (HEAD:${head} workdir:${workdir} stage:${stage})`
  })

  return [
    `Branch: ${branch || "(detached)"}`,
    `Branches: ${branches.join(", ") || "(none)"}`,
    files.length ? `Changed files:\n${files.join("\n")}` : "Working tree clean.",
  ].join("\n")
}

export async function gitSwitchBranch(args: {
  dir: string
  branch: string
  create?: boolean
  remote?: string
}): Promise<string> {
  const dir = normalizeDir(args.dir)
  if (args.create) {
    await git.branch({ fs: opfsGitFs, dir, ref: args.branch, checkout: true })
    return `Created and switched to branch ${args.branch}.`
  }

  await git.checkout({
    fs: opfsGitFs,
    dir,
    ref: args.branch,
    remote: args.remote,
  })
  return `Switched to branch ${args.branch}.`
}

export async function gitCommit(args: {
  dir: string
  message: string
  authorName?: string
  authorEmail?: string
  paths?: string[]
}): Promise<string> {
  const dir = normalizeDir(args.dir)
  await stageAll(dir, args.paths)
  const sha = await git.commit({
    fs: opfsGitFs,
    dir,
    message: args.message,
    author: {
      name: args.authorName || "Sandbox User",
      email: args.authorEmail || "sandbox@example.local",
    },
  })
  return `Committed ${sha}.`
}

export async function gitPush(args: {
  dir: string
  sessionID: string
  remote?: string
  branch?: string
  force?: boolean
  signal?: AbortSignal
} & AuthArgs): Promise<string> {
  const dir = normalizeDir(args.dir)
  const remote = args.remote || "origin"
  const branch = args.branch || (await currentBranch(dir))
  const url = await remoteUrl(dir, remote)
  const force = args.force ?? false
  const approval = { dir, remote, branch, url, force }

  if (!hasAlwaysApproval(approval)) {
    const response = await requestSandboxPermission({
      sessionID: args.sessionID,
      permission: "git_push",
      patterns: [`git push ${force ? "--force " : ""}${remote} ${branch}`, url],
      metadata: {
        sandboxGitPush: true,
        requiresExplicitUserApproval: true,
        dir,
        remote,
        branch,
        url,
        force,
      },
      signal: args.signal,
    })

    if (response === "reject") return `Push to ${remote}/${branch} was denied.`
    if (response === "always") rememberApproval(approval)
  }

  const result = await git.push({
    fs: opfsGitFs,
    http,
    dir,
    remote,
    ref: branch,
    force,
    onAuth: authCallback(args),
  })

  if (result.ok) return `Pushed ${branch} to ${remote}.`
  return `Push completed with status: ${JSON.stringify(result)}`
}
