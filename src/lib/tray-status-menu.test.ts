import { describe, expect, it, vi } from "vitest"
import { buildTrayIndicatorTitle, buildTrayStatusMenuPayload } from "@/lib/tray-status-menu"
import type { PluginMeta, PluginOutput } from "@/lib/plugin-types"

const META: PluginMeta[] = [
  {
    id: "codex",
    name: "Codex",
    iconUrl: "codex-icon",
    lines: [],
    primaryCandidates: ["Session"],
  },
  {
    id: "claude",
    name: "Claude",
    iconUrl: "claude-icon",
    lines: [],
    primaryCandidates: ["Requests"],
  },
]

function output(providerId: string, lines: PluginOutput["lines"]): PluginOutput {
  return {
    providerId,
    displayName: providerId,
    iconUrl: `${providerId}-icon`,
    lines,
  }
}

describe("tray-status-menu", () => {
  it("formats primary session percent left with reset text", () => {
    const payload = buildTrayStatusMenuPayload({
      pluginsMeta: META,
      pluginSettings: { order: ["codex"], disabled: [] },
      displayMode: "left",
      nowMs: Date.parse("2026-05-22T12:00:00Z"),
      pluginStates: {
        codex: {
          loading: false,
          error: null,
          data: output("codex", [
            {
              type: "progress",
              label: "Session",
              used: 28,
              limit: 100,
              format: { kind: "percent" },
              resetsAt: "2026-05-22T14:30:00Z",
            },
          ]),
        },
      },
    })

    expect(payload.agents).toEqual([
      {
        id: "codex",
        name: "Codex",
        summary: "72% left",
        detail: "Resets in 2h 30m",
        resetsAtMs: new Date("2026-05-22T14:30:00Z").getTime(),
      },
    ])
  })

  it("formats count metrics as requests left", () => {
    const payload = buildTrayStatusMenuPayload({
      pluginsMeta: META,
      pluginSettings: { order: ["claude"], disabled: [] },
      displayMode: "left",
      pluginStates: {
        claude: {
          loading: false,
          error: null,
          data: output("claude", [
            {
              type: "progress",
              label: "Requests",
              used: 15,
              limit: 50,
              format: { kind: "count", suffix: "requests" },
            },
          ]),
        },
      },
    })

    expect(payload.agents[0]?.summary).toBe("35 requests left")
  })

  it("omits probe errors and disabled plugins", () => {
    const payload = buildTrayStatusMenuPayload({
      pluginsMeta: META,
      pluginSettings: { order: ["codex", "claude"], disabled: ["claude"] },
      displayMode: "left",
      pluginStates: {
        codex: {
          loading: false,
          error: "Session expired",
          data: null,
        },
        claude: {
          loading: false,
          error: null,
          data: output("claude", []),
        },
      },
    })

    expect(payload.agents).toEqual([])
  })

  it("builds a compact indicator title from signed-in agents", () => {
    const payload = buildTrayStatusMenuPayload({
      pluginsMeta: META,
      pluginSettings: { order: ["codex", "claude"], disabled: [] },
      displayMode: "left",
      pluginStates: {
        codex: {
          loading: false,
          error: null,
          data: output("codex", [
            {
              type: "progress",
              label: "Session",
              used: 28,
              limit: 100,
              format: { kind: "percent" },
            },
          ]),
        },
        claude: {
          loading: false,
          error: null,
          data: output("claude", [
            {
              type: "progress",
              label: "Requests",
              used: 15,
              limit: 50,
              format: { kind: "count", suffix: "requests" },
            },
          ]),
        },
      },
    })

    expect(buildTrayIndicatorTitle(payload)).toBe("Codex 72% left  |  Claude 35 requests left")
  })

  it("limits indicator title by configured agent count", () => {
    const payload = {
      agents: [
        { id: "a", name: "Alpha", summary: "90% left" },
        { id: "b", name: "Beta", summary: "80% left" },
        { id: "c", name: "Gamma", summary: "70% left" },
      ],
    }

    expect(buildTrayIndicatorTitle(payload, 2)).toBe("Alpha 90% left  |  Beta 80% left")
  })

  it("formats indicator reset times as h or m left", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-22T12:00:00Z"))
    try {
      const payload = {
        agents: [
          {
            id: "gemini",
            name: "Gemini 3.1 Pro (High)",
            summary: "100% left",
            resetsAtMs: Date.parse("2026-05-22T14:30:00Z"),
          },
          {
            id: "sonnet",
            name: "Claude Sonnet 4.6 (Thinking)",
            summary: "100% left",
            resetsAtMs: Date.parse("2026-05-22T12:10:00Z"),
          },
        ],
      }

      expect(buildTrayIndicatorTitle(payload)).toBe(
        "Gemini High 100% 2h left  |  Sonnet 100% 10m left"
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("uses only the selected Antigravity model for the tray title", () => {
    const payload = buildTrayStatusMenuPayload({
      pluginsMeta: [
        {
          id: "antigravity",
          name: "Antigravity",
          iconUrl: "ag-icon",
          lines: [],
          primaryCandidates: ["Tracked"],
        },
      ],
      pluginSettings: { order: ["antigravity"], disabled: [] },
      displayMode: "left",
      pluginStates: {
        antigravity: {
          loading: false,
          error: null,
          data: output("antigravity", [
            {
              type: "progress",
              label: "Tracked",
              used: 0,
              limit: 100,
              format: { kind: "percent" },
            },
            {
              type: "progress",
              label: "Gemini 3.1 Pro (High)",
              used: 0,
              limit: 100,
              format: { kind: "percent" },
              color: "tracked",
            },
            {
              type: "progress",
              label: "Claude Sonnet 4.6 (Thinking)",
              used: 0,
              limit: 100,
              format: { kind: "percent" },
            },
          ]),
        },
      },
    })

    expect(payload.agents.map((agent) => agent.name)).toEqual(["Gemini 3.1 Pro (High)"])
  })
})
