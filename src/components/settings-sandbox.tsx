import { Component, createSignal, createEffect, on } from "solid-js"
import { TextField } from "@opencode-ai/ui/text-field"
import { loadSettings, saveSettings } from "@/lib/sandbox-settings"
import { SettingsList } from "./settings-list"

export const SettingsSandbox: Component = () => {
  const current = loadSettings()
  const [baseUrl, setBaseUrl] = createSignal(current.baseUrl)
  const [apiKey, setApiKey] = createSignal(current.apiKey)
  const [model, setModel] = createSignal(current.model)

  createEffect(
    on([baseUrl, apiKey, model], () => {
      saveSettings({
        baseUrl: baseUrl(),
        apiKey: apiKey(),
        model: model(),
      })
    }, { defer: true }),
  )

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">API</h2>
        </div>
      </div>
      <div class="flex flex-col gap-8 max-w-[720px]">
        <SettingsList>
          <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-14-medium text-text-strong">API Base URL</span>
              <span class="text-12-regular text-text-weak">OpenAI, OpenRouter, or any compatible endpoint</span>
            </div>
            <div class="flex w-full justify-end sm:w-auto sm:shrink-0">
              <div class="w-full sm:w-[280px]">
                <TextField
                  label="API Base URL"
                  hideLabel
                  type="text"
                  value={baseUrl()}
                  onChange={setBaseUrl}
                  placeholder="https://api.openai.com"
                  spellcheck={false}
                  autocorrect="off"
                  autocomplete="off"
                  autocapitalize="off"
                  class="text-12-regular"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-14-medium text-text-strong">API Key</span>
              <span class="text-12-regular text-text-weak">Stored in localStorage, never sent anywhere except your API endpoint</span>
            </div>
            <div class="flex w-full justify-end sm:w-auto sm:shrink-0">
              <div class="w-full sm:w-[280px]">
                <TextField
                  label="API Key"
                  hideLabel
                  type="password"
                  value={apiKey()}
                  onChange={setApiKey}
                  placeholder="sk-..."
                  spellcheck={false}
                  autocorrect="off"
                  autocomplete="off"
                  autocapitalize="off"
                  class="text-12-regular"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-4 py-3 border-b border-border-weak-base last:border-none sm:flex-nowrap">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-14-medium text-text-strong">Model</span>
              <span class="text-12-regular text-text-weak">Model identifier to use for completions</span>
            </div>
            <div class="flex w-full justify-end sm:w-auto sm:shrink-0">
              <div class="w-full sm:w-[280px]">
                <TextField
                  label="Model"
                  hideLabel
                  type="text"
                  value={model()}
                  onChange={setModel}
                  placeholder="gpt-4o"
                  spellcheck={false}
                  autocorrect="off"
                  autocomplete="off"
                  autocapitalize="off"
                  class="text-12-regular"
                />
              </div>
            </div>
          </div>
        </SettingsList>
      </div>
    </div>
  )
}
