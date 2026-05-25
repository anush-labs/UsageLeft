import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

import { ProviderDetailPage } from "@/pages/provider-detail"

describe("ProviderDetailPage", () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue([])
  })

  it("shows not found when plugin missing", () => {
    render(<ProviderDetailPage plugin={null} displayMode="used" resetTimerDisplayMode="relative" />)
    expect(screen.getByText("Provider not found")).toBeInTheDocument()
  })

  it("renders ProviderCard with all scope when plugin present", async () => {
    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: { id: "a", name: "Alpha", iconUrl: "", lines: [] },
          data: { providerId: "a", displayName: "Alpha", iconUrl: "", lines: [] },
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastUpdatedAt: null,
        }}
      />
    )
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0)
  })

  it("renders when plugin data is null (still shows provider name)", () => {
    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: { id: "a", name: "Alpha", iconUrl: "", lines: [] },
          data: null,
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastUpdatedAt: null,
        }}
      />
    )
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0)
  })

  it("renders quick links when provided by plugin meta", () => {
    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        plugin={{
          meta: {
            id: "a",
            name: "Alpha",
            iconUrl: "",
            lines: [],
            links: [{ label: "Status", url: "https://status.example.com" }],
          },
          data: null,
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastUpdatedAt: null,
        }}
      />
    )
    expect(screen.getByRole("button", { name: /status/i })).toBeInTheDocument()
  })

  it("lets Copilot switch between GitHub CLI accounts", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_github_accounts") return ["user-a", "user-b"]
      if (cmd === "read_plugin_config") return JSON.stringify({ account: "user-a" })
      if (cmd === "write_plugin_config") return undefined
      return []
    })

    render(
      <ProviderDetailPage
        displayMode="used"
        resetTimerDisplayMode="relative"
        onRetry={onRetry}
        plugin={{
          meta: { id: "copilot", name: "GitHub Copilot", iconUrl: "", lines: [] },
          data: {
            providerId: "copilot",
            displayName: "GitHub Copilot",
            iconUrl: "",
            lines: [{ type: "text", label: "Account", value: "user-a" }],
          },
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastUpdatedAt: null,
        }}
      />
    )

    await user.selectOptions(
      await screen.findByRole("combobox", { name: /github account/i }),
      "user-b"
    )

    expect(invokeMock).toHaveBeenCalledWith("write_plugin_config", {
      pluginId: "copilot",
      configJson: JSON.stringify({ account: "user-b" }),
    })
    await waitFor(() => expect(onRetry).toHaveBeenCalled())
  })

  it("lets Antigravity switch the selected model from the top control", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    invokeMock.mockResolvedValue(undefined)

    render(
      <ProviderDetailPage
        displayMode="left"
        resetTimerDisplayMode="relative"
        onRetry={onRetry}
        plugin={{
          meta: { id: "antigravity", name: "Antigravity", iconUrl: "", lines: [] },
          data: {
            providerId: "antigravity",
            displayName: "Antigravity",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Tracked",
                used: 20,
                limit: 100,
                format: { kind: "percent" },
              },
              {
                type: "progress",
                label: "Gemini 3.1 Pro (High)",
                used: 20,
                limit: 100,
                format: { kind: "percent" },
                color: "tracked",
              },
              {
                type: "progress",
                label: "Claude Sonnet 4.6 (Thinking)",
                used: 40,
                limit: 100,
                format: { kind: "percent" },
              },
            ],
          },
          loading: false,
          error: null,
          lastManualRefreshAt: null,
          lastUpdatedAt: null,
        }}
      />
    )

    await user.selectOptions(
      screen.getByRole("combobox", { name: /antigravity model/i }),
      "Claude Sonnet 4.6 (Thinking)"
    )

    expect(invokeMock).toHaveBeenCalledWith("write_plugin_config", {
      pluginId: "antigravity",
      configJson: JSON.stringify({ trackedModel: "Claude Sonnet 4.6 (Thinking)" }),
    })
    await waitFor(() => expect(onRetry).toHaveBeenCalled())
  })
})
