import { openDB, type DBSchema, type IDBPDatabase } from "idb"

interface SandboxDB extends DBSchema {
  sessions: {
    key: string
    value: {
      id: string
      title: string
      createdAt: number
      updatedAt: number
      parentID?: string
    }
    indexes: { "by-updated": number }
  }
  messages: {
    key: number
    value: {
      sessionId: string
      id: string
      role: "user" | "assistant"
      parts: unknown[]
      time: { created: number; completed?: number }
      metadata?: Record<string, unknown>
    }
    indexes: { "by-session": string }
  }
}

let dbPromise: Promise<IDBPDatabase<SandboxDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<SandboxDB>("opencode-sandbox", 1, {
      upgrade(db) {
        const sessions = db.createObjectStore("sessions", { keyPath: "id" })
        sessions.createIndex("by-updated", "updatedAt")
        const messages = db.createObjectStore("messages", { autoIncrement: true })
        messages.createIndex("by-session", "sessionId")
      },
    })
  }
  return dbPromise
}

export async function createSession(title?: string, parentID?: string) {
  const db = await getDB()
  const id = crypto.randomUUID()
  const now = Date.now()
  const session = {
    id,
    title: title || "New Session",
    createdAt: now,
    updatedAt: now,
    parentID,
  }
  await db.put("sessions", session)
  return session
}

export async function listSessions() {
  const db = await getDB()
  const all = await db.getAllFromIndex("sessions", "by-updated")
  return all.reverse()
}

export async function getSession(id: string) {
  const db = await getDB()
  return db.get("sessions", id)
}

export async function updateSession(id: string, updates: { title?: string }) {
  const db = await getDB()
  const session = await db.get("sessions", id)
  if (!session) throw new Error(`Session ${id} not found`)
  const updated = { ...session, ...updates, updatedAt: Date.now() }
  await db.put("sessions", updated)
  return updated
}

export async function deleteSession(id: string) {
  const db = await getDB()
  await db.delete("sessions", id)
  const tx = db.transaction("messages", "readwrite")
  const index = tx.store.index("by-session")
  let cursor = await index.openCursor(id)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}

export async function addMessage(
  sessionId: string,
  msg: {
    id: string
    role: "user" | "assistant"
    parts: unknown[]
    time: { created: number; completed?: number }
    metadata?: Record<string, unknown>
  },
) {
  const db = await getDB()
  await db.add("messages", { sessionId, ...msg })
  const session = await db.get("sessions", sessionId)
  if (session) {
    session.updatedAt = Date.now()
    await db.put("sessions", session)
  }
}

export async function getMessages(sessionId: string) {
  const db = await getDB()
  return db.getAllFromIndex("messages", "by-session", sessionId)
}

export async function clearMessages(sessionId: string) {
  const db = await getDB()
  const tx = db.transaction("messages", "readwrite")
  const index = tx.store.index("by-session")
  let cursor = await index.openCursor(sessionId)
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  await tx.done
}
