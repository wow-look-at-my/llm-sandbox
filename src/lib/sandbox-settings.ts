const STORAGE_KEY = "opencode-sandbox-settings"

export interface SandboxSettings {
  apiKey: string
  baseUrl: string
  model: string
}

const defaults: SandboxSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com",
  model: "gpt-4o",
}

export function loadSettings(): SandboxSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...defaults }
    return { ...defaults, ...JSON.parse(stored) }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(settings: SandboxSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function isConfigured(): boolean {
  return loadSettings().apiKey.length > 0
}
