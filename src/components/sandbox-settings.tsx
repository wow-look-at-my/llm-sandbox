import { createSignal, Show } from "solid-js"
import { loadSettings, saveSettings, isConfigured } from "@/lib/sandbox-settings"

export function SandboxSettingsDialog(props: { open: boolean; onClose: () => void }) {
  const current = loadSettings()
  const [apiKey, setApiKey] = createSignal(current.apiKey)
  const [baseUrl, setBaseUrl] = createSignal(current.baseUrl)
  const [model, setModel] = createSignal(current.model)
  const [showKey, setShowKey] = createSignal(false)

  const handleSave = () => {
    saveSettings({
      apiKey: apiKey(),
      baseUrl: baseUrl(),
      model: model(),
    })
    props.onClose()
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose()
        }}
      >
        <div class="bg-surface-base rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-border-base">
          <h2 class="text-16-medium text-text-strong mb-1">Sandbox Settings</h2>
          <p class="text-12-regular text-text-weak mb-5">
            Configure your OpenAI-compatible API to use the agent.
          </p>

          <div class="flex flex-col gap-4">
            <label class="flex flex-col gap-1.5">
              <span class="text-12-medium text-text-base">API Base URL</span>
              <input
                type="text"
                value={baseUrl()}
                onInput={(e) => setBaseUrl(e.currentTarget.value)}
                placeholder="https://api.openai.com"
                class="px-3 py-2 rounded-lg bg-surface-raised-base border border-border-base text-13-regular text-text-strong placeholder:text-text-weak focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
              <span class="text-11-regular text-text-weak">
                OpenAI, OpenRouter, or any compatible endpoint
              </span>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-12-medium text-text-base">API Key</span>
              <div class="relative">
                <input
                  type={showKey() ? "text" : "password"}
                  value={apiKey()}
                  onInput={(e) => setApiKey(e.currentTarget.value)}
                  placeholder="sk-..."
                  class="w-full px-3 py-2 pr-16 rounded-lg bg-surface-raised-base border border-border-base text-13-regular text-text-strong placeholder:text-text-weak focus:outline-none focus:ring-1 focus:ring-border-focus font-mono"
                />
                <button
                  type="button"
                  class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-11-regular text-text-weak hover:text-text-base"
                  onClick={() => setShowKey(!showKey())}
                >
                  {showKey() ? "Hide" : "Show"}
                </button>
              </div>
              <span class="text-11-regular text-text-weak">
                Stored in localStorage. Never sent anywhere except your API endpoint.
              </span>
            </label>

            <label class="flex flex-col gap-1.5">
              <span class="text-12-medium text-text-base">Model</span>
              <input
                type="text"
                value={model()}
                onInput={(e) => setModel(e.currentTarget.value)}
                placeholder="gpt-4o"
                class="px-3 py-2 rounded-lg bg-surface-raised-base border border-border-base text-13-regular text-text-strong placeholder:text-text-weak focus:outline-none focus:ring-1 focus:ring-border-focus"
              />
            </label>
          </div>

          <div class="flex gap-2 mt-6 justify-end">
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-13-medium text-text-base hover:bg-surface-raised-base-hover transition-colors"
              onClick={props.onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-surface-primary-base text-text-on-primary text-13-medium hover:bg-surface-primary-base-hover transition-colors disabled:opacity-50"
              disabled={!apiKey().trim()}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}

export function SandboxSettingsGate(props: { children: any }) {
  const [showSettings, setShowSettings] = createSignal(!isConfigured())

  return (
    <>
      <Show when={showSettings()}>
        <SandboxSettingsDialog open={true} onClose={() => setShowSettings(false)} />
      </Show>
      {props.children}
    </>
  )
}
