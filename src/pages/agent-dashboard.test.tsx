import { createRef } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentDashboard } from "@/pages/agent-dashboard"
import type { PluginDisplayState } from "@/lib/plugin-types"

function makePlugin(overrides: Partial<PluginDisplayState> = {}): PluginDisplayState {
  const id = overrides.meta?.id ?? "alpha"
  const name = overrides.meta?.name ?? "Alpha"

  return {
    meta: {
      id,
      name,
      iconUrl: overrides.meta?.iconUrl ?? "icon.svg",
      brandColor: overrides.meta?.brandColor ?? "#10b981",
      lines: overrides.meta?.lines ?? [{ type: "progress", label: "Session", scope: "overview" }],
      primaryCandidates: overrides.meta?.primaryCandidates ?? ["Session"],
      links: overrides.meta?.links,
    },
    data: overrides.data ?? {
      providerId: id,
      displayName: name,
      iconUrl: "icon.svg",
      lines: [
        {
          type: "progress",
          label: "Session",
          used: 25,
          limit: 100,
          format: { kind: "percent" },
          resetsAt: "2026-02-03T01:30:00.000Z",
        },
      ],
    },
    loading: overrides.loading ?? false,
    error: overrides.error ?? null,
    lastManualRefreshAt: overrides.lastManualRefreshAt ?? null,
    lastUpdatedAt: overrides.lastUpdatedAt ?? null,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AgentDashboard", () => {
  it("renders agent cards using the primary progress line", () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-02-03T00:00:00.000Z"))

    render(
      <AgentDashboard
        plugins={[makePlugin()]}
        scrollRef={createRef<HTMLDivElement>()}
        onRefreshAll={vi.fn()}
        onOpenPlugin={vi.fn()}
        onOpenSettings={vi.fn()}
        onQuitApp={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument()
    expect(screen.getByText("75% left")).toBeInTheDocument()
    expect(screen.getByText("~1h 30m")).toBeInTheDocument()
  })

  it("wires dashboard actions", () => {
    const onRefreshAll = vi.fn()
    const onOpenPlugin = vi.fn()
    const onOpenSettings = vi.fn()
    const onQuitApp = vi.fn()

    render(
      <AgentDashboard
        plugins={[makePlugin()]}
        scrollRef={createRef<HTMLDivElement>()}
        onRefreshAll={onRefreshAll}
        onOpenPlugin={onOpenPlugin}
        onOpenSettings={onOpenSettings}
        onQuitApp={onQuitApp}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: /refresh agents/i }))
    fireEvent.click(screen.getByRole("button", { name: "Alpha" }))
    fireEvent.click(screen.getByRole("button", { name: "Settings" }))
    fireEvent.click(screen.getByRole("button", { name: "Quit" }))

    expect(onRefreshAll).toHaveBeenCalledTimes(1)
    expect(onOpenPlugin).toHaveBeenCalledWith("alpha")
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(onQuitApp).toHaveBeenCalledTimes(1)
  })

  it("renders empty state when no agents are enabled", () => {
    render(
      <AgentDashboard
        plugins={[]}
        scrollRef={createRef<HTMLDivElement>()}
        onRefreshAll={vi.fn()}
        onOpenPlugin={vi.fn()}
        onOpenSettings={vi.fn()}
        onQuitApp={vi.fn()}
      />
    )

    expect(screen.getByText("No agents enabled")).toBeInTheDocument()
  })
})
