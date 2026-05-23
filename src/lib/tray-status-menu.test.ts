import { describe, expect, it } from "vitest"
import { buildTrayStatusMenuPayload } from "@/lib/tray-status-menu"
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

  it("shows probe errors and omits disabled plugins", () => {
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

    expect(payload.agents).toEqual([
      {
        id: "codex",
        name: "Codex",
        summary: "Session expired",
        status: "Error",
      },
    ])
  })
})
