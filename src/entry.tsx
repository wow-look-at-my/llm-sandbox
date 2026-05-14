// @refresh reload

import { render } from "solid-js/web"
import { AppBaseProviders, AppInterface } from "@/app"
import { type Platform, PlatformProvider } from "@/context/platform"
import { ServerConnection } from "./context/server"
import { SandboxSettingsGate } from "@/components/sandbox-settings"

const platform: Platform = {
  platform: "web",
  version: "0.1.0-sandbox",
  openLink: (url) => window.open(url, "_blank"),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  restart: async () => window.location.reload(),
  notify: async () => {},
  getDefaultServer: async () => ServerConnection.Key.make("http://localhost:0"),
  setDefaultServer: () => {},
}

const root = document.getElementById("root")
if (root instanceof HTMLElement) {
  const server: ServerConnection.Http = {
    type: "http",
    authToken: false,
    http: {
      url: "http://localhost:0",
    },
  }
  render(
    () => (
      <PlatformProvider value={platform}>
        <AppBaseProviders>
          <SandboxSettingsGate>
            <AppInterface
              defaultServer={ServerConnection.Key.make("http://localhost:0")}
              servers={[server]}
              disableHealthCheck
            />
          </SandboxSettingsGate>
        </AppBaseProviders>
      </PlatformProvider>
    ),
    root,
  )
}
