import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import { OverviewPage } from "@/pages/overview"
import type { PluginDisplayState } from "@/lib/plugin-types"

function makePlugin(overrides: Partial<PluginDisplayState> = {}): PluginDisplayState {
  const id = overrides.meta?.id ?? "alpha"
  const name = overrides.meta?.name ?? "Alpha"

  return {
    meta: {
      id,
      name,
      iconUrl: overrides.meta?.iconUrl ?? "icon",
      brandColor: overrides.meta?.brandColor ?? "#10b981",
      lines: overrides.meta?.lines ?? [
        { type: "progress", label: "Session", scope: "overview" },
      ],
      primaryCandidates: overrides.meta?.primaryCandidates ?? ["Session"],
      links: overrides.meta?.links,
    },
    data: overrides.data ?? {
      providerId: id,
      displayName: name,
      iconUrl: "icon",
      lines: [
        {
          type: "progress",
          label: "Session",
          used: 25,
          limit: 100,
          format: { kind: "percent" },
        },
      ],
    },
    loading: overrides.loading ?? false,
    error: overrides.error ?? null,
    lastManualRefreshAt: overrides.lastManualRefreshAt ?? null,
    lastUpdatedAt: overrides.lastUpdatedAt ?? null,
  }
}

function renderOverview(overrides: Partial<ComponentProps<typeof OverviewPage>> = {}) {
  const props: ComponentProps<typeof OverviewPage> = {
    plugins: [],
    onRefreshAll: vi.fn(),
    onOpenPlugin: vi.fn(),
    onOpenSettings: vi.fn(),
    onQuitApp: vi.fn(),
    displayMode: "left",
    resetTimerDisplayMode: "relative",
    ...overrides,
  }

  render(<OverviewPage {...props} />)
  return props
}

describe("OverviewPage", () => {
  it("renders empty state", () => {
    renderOverview()
    expect(screen.getByText("No agents enabled")).toBeInTheDocument()
  })

  it("renders agent cards with usage left", () => {
    renderOverview({ plugins: [makePlugin()] })
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument()
    expect(screen.getByText("75% left")).toBeInTheDocument()
    expect(screen.getByText("Session")).toBeInTheDocument()
  })

  it("opens dashboard actions", () => {
    const props = renderOverview({ plugins: [makePlugin()] })

    fireEvent.click(screen.getByRole("button", { name: "Refresh all agents" }))
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "Quit" }))

    expect(props.onRefreshAll).toHaveBeenCalledTimes(1)
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
    expect(props.onQuitApp).toHaveBeenCalledTimes(1)
  })

  it("limits the dashboard grid to six agents", () => {
    const plugins = Array.from({ length: 7 }, (_, index) =>
      makePlugin({
        meta: {
          id: `agent-${index}`,
          name: `Agent ${index}`,
          iconUrl: "icon",
          lines: [{ type: "progress", label: "Session", scope: "overview" }],
          primaryCandidates: ["Session"],
        },
      })
    )

    renderOverview({ plugins })
    expect(screen.getByRole("button", { name: "Agent 5" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Agent 6" })).not.toBeInTheDocument()
  })

  it("does not show provider quick links in combined view", () => {
    renderOverview({
      plugins: [
        makePlugin({
          meta: {
            id: "alpha",
            name: "Alpha",
            iconUrl: "icon",
            lines: [],
            primaryCandidates: [],
            links: [{ label: "Status", url: "https://status.example.com" }],
          },
        }),
      ],
    })

    expect(screen.queryByRole("button", { name: /status/i })).toBeNull()
  })
})
