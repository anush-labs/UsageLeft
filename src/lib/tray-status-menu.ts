import { invoke } from "@tauri-apps/api/core"
import type { MetricLine, PluginMeta, PluginOutput, ProgressFormat } from "@/lib/plugin-types"
import { formatResetRelativeLabel } from "@/lib/reset-tooltip"
import { getEnabledPluginIds, type DisplayMode, type PluginSettings } from "@/lib/settings"
import { clamp01, formatCountNumber, formatFixedPrecisionNumber } from "@/lib/utils"

type PluginState = {
  data: PluginOutput | null
  loading: boolean
  error: string | null
}

type ProgressLine = Extract<MetricLine, { type: "progress" }>
type BadgeLine = Extract<MetricLine, { type: "badge" }>

export type TrayStatusMenuAgent = {
  id: string
  name: string
  summary: string
  detail?: string
  status?: string
}

export type TrayStatusMenuPayload = {
  agents: TrayStatusMenuAgent[]
}

function isProgressLine(line: MetricLine): line is ProgressLine {
  return line.type === "progress"
}

function isBadgeLine(line: MetricLine): line is BadgeLine {
  return line.type === "badge"
}

function formatAmount(value: number, format: ProgressFormat): string {
  if (format.kind === "dollars") return `$${formatFixedPrecisionNumber(value)}`
  if (format.kind === "count") return `${formatCountNumber(value)} ${format.suffix}`
  return `${Math.round(value)}%`
}

function formatProgressSummary(line: ProgressLine, displayMode: DisplayMode): string | null {
  if (!Number.isFinite(line.limit) || line.limit <= 0) return null
  const rawAmount = displayMode === "left" ? line.limit - line.used : line.used
  const suffix = displayMode === "left" ? "left" : "used"

  if (line.format.kind === "percent") {
    const percent = Math.round(clamp01(rawAmount / line.limit) * 100)
    return `${percent}% ${suffix}`
  }

  const amount = Math.max(0, rawAmount)
  return `${formatAmount(amount, line.format)} ${suffix}`
}

function findPrimaryProgressLine(meta: PluginMeta, data: PluginOutput): ProgressLine | null {
  for (const label of meta.primaryCandidates ?? []) {
    const line = data.lines.find((candidate) => isProgressLine(candidate) && candidate.label === label)
    if (line && isProgressLine(line)) return line
  }
  return null
}

function findStatusText(data: PluginOutput): string | null {
  const error = data.lines.find((line) => isBadgeLine(line) && line.label === "Error")
  if (error && isBadgeLine(error)) return error.text

  const status = data.lines.find((line) => isBadgeLine(line) && line.label === "Status")
  if (status && isBadgeLine(status)) return status.text

  return null
}

function buildAgentStatus(args: {
  meta: PluginMeta
  state: PluginState | undefined
  displayMode: DisplayMode
  nowMs: number
}): TrayStatusMenuAgent | null {
  const { meta, state, displayMode, nowMs } = args
  if (!state || state.error) return null

  const data = state?.data ?? null
  if (!data) return null

  const progress = findPrimaryProgressLine(meta, data)
  if (progress) {
    const summary = formatProgressSummary(progress, displayMode) ?? "No limit data"
    const detail = progress.resetsAt
      ? formatResetRelativeLabel(nowMs, progress.resetsAt) ?? undefined
      : undefined
    return { id: meta.id, name: meta.name, summary, detail }
  }

  const statusText = findStatusText(data)
  if (statusText) return { id: meta.id, name: meta.name, summary: statusText }

  return null
}

function compactAgentName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "Agent"
  if (trimmed.length <= 12) return trimmed
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const initials = words.map((word) => word[0]?.toUpperCase()).join("")
    if (initials.length >= 2 && initials.length <= 5) return initials
  }
  return `${trimmed.slice(0, 11)}...`
}

function compactSummary(summary: string): string {
  return summary
    .replace(/\brequests\b/g, "req")
    .replace(/\btokens\b/g, "tok")
    .replace(/\bleft\b/g, "left")
    .replace(/\bused\b/g, "used")
}

export function buildTrayStatusMenuPayload(args: {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState | undefined>
  displayMode: DisplayMode
  nowMs?: number
}): TrayStatusMenuPayload {
  const { pluginsMeta, pluginSettings, pluginStates, displayMode, nowMs = Date.now() } = args
  if (!pluginSettings) return { agents: [] }

  const metaById = new Map(pluginsMeta.map((plugin) => [plugin.id, plugin]))
  const agents = getEnabledPluginIds(pluginSettings)
    .map((id) => metaById.get(id))
    .filter((meta): meta is PluginMeta => Boolean(meta))
    .map((meta) => buildAgentStatus({
      meta,
      state: pluginStates[meta.id],
      displayMode,
      nowMs,
    }))
    .filter((agent): agent is TrayStatusMenuAgent => Boolean(agent))

  return { agents }
}

export function buildTrayIndicatorTitle(payload: TrayStatusMenuPayload): string {
  const parts = payload.agents.map((agent) => (
    `${compactAgentName(agent.name)} ${compactSummary(agent.summary)}`
  ))
  const title = parts.join(" | ")
  if (title.length <= 120) return title
  return `${title.slice(0, 117)}...`
}

export async function updateTrayStatusMenu(payload: TrayStatusMenuPayload): Promise<void> {
  await invoke("update_tray_status_menu", { payload })
}
