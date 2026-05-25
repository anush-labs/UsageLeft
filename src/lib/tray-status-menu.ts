import { invoke } from "@tauri-apps/api/core"
import type { MetricLine, PluginMeta, PluginOutput, ProgressFormat } from "@/lib/plugin-types"
import { formatResetRelativeLabel } from "@/lib/reset-tooltip"
import { getEnabledPluginIds, type DisplayMode, type PluginSettings, type ResetTimerDisplayMode } from "@/lib/settings"
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
  resetsAtMs?: number
  color?: string
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
  color: string
}): TrayStatusMenuAgent | null {
  const { meta, state, displayMode, nowMs, color } = args
  if (!state || state.error) return null

  const data = state?.data ?? null
  if (!data) return null

  const progress = findPrimaryProgressLine(meta, data)
  if (progress) {
    const summary = formatProgressSummary(progress, displayMode) ?? "No limit data"
    const detail = progress.resetsAt
      ? formatResetRelativeLabel(nowMs, progress.resetsAt) ?? undefined
      : undefined
    const resetsAtMs = progress.resetsAt ? new Date(progress.resetsAt).getTime() : undefined
    return { id: meta.id, name: meta.name, summary, detail, resetsAtMs, color }
  }

  const statusText = findStatusText(data)
  if (statusText) return { id: meta.id, name: meta.name, summary: statusText, color }

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
    .map((meta) => {
      const color = pluginSettings.customColors?.[meta.id] ?? meta.brandColor ?? "#ffffff"
      return buildAgentStatus({
        meta,
        state: pluginStates[meta.id],
        displayMode,
        nowMs,
        color
      })
    })
    .filter((agent): agent is TrayStatusMenuAgent => Boolean(agent))

  return { agents }
}

function formatCompactTimeLeft(nowMs: number, resetsAtMs: number): string {
  const deltaMs = resetsAtMs - nowMs
  if (deltaMs <= 0) return "0m"
  const hours = Math.floor(deltaMs / 3_600_000)
  if (hours >= 1) return `${hours}h`
  const minutes = Math.max(1, Math.ceil(deltaMs / 60_000))
  return `${minutes}m`
}

function formatAbsoluteResetTime(resetsAtMs: number): string {
  const d = new Date(resetsAtMs)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h < 12 ? "a" : "p"
  const h12 = h % 12 === 0 ? 12 : h % 12
  if (m === 0) return `${h12}${ampm}`
  const mm = String(m).padStart(2, "0")
  return `${h12}:${mm}${ampm}`
}

export function buildTrayIndicatorTextSegments(
  payload: TrayStatusMenuPayload,
  maxAgents = payload.agents.length,
  resetTimerDisplayMode: ResetTimerDisplayMode = "relative",
  omitName = false,
  targetAgentId?: string | null,
): { text: string; color: string }[] {
  const nowMs = Date.now()
  let agents = payload.agents
  if (targetAgentId) {
    agents = agents.filter(a => a.id === targetAgentId)
  }
  
  const segments: { text: string; color: string }[] = []
  
  const filtered = agents.slice(0, maxAgents)
  filtered.forEach((agent, i) => {
    const name = compactAgentName(agent.name)
    const pct = agent.summary.replace(/\s+(left|used)$/, "")
    let timeStr = ""
    if (agent.resetsAtMs && agent.resetsAtMs > nowMs) {
      timeStr = resetTimerDisplayMode === "absolute"
        ? formatAbsoluteResetTime(agent.resetsAtMs)
        : formatCompactTimeLeft(nowMs, agent.resetsAtMs)
    }
    
    const color = agent.color || "#ffffff"
    const metricStr = timeStr ? `${pct} ${timeStr}` : pct
    
    if (omitName) {
      segments.push({ text: metricStr, color })
    } else {
      segments.push({ text: `${name} `, color: "white" })
      segments.push({ text: metricStr, color })
    }
    
    if (i < filtered.length - 1) {
      segments.push({ text: "  |  ", color: "white" })
    }
  })
  
  return segments
}

export function buildTrayIndicatorTitle(
  payload: TrayStatusMenuPayload,
  maxAgents = payload.agents.length,
  resetTimerDisplayMode: ResetTimerDisplayMode = "relative",
  omitName = false,
  targetAgentId?: string | null,
): string {
  const nowMs = Date.now()
  let agents = payload.agents
  if (targetAgentId) {
    agents = agents.filter(a => a.id === targetAgentId)
  }
  const parts = agents.slice(0, maxAgents).map((agent) => {
    const name = compactAgentName(agent.name)
    const pct = agent.summary.replace(/\s+(left|used)$/, "")
    let timeStr = ""
    if (agent.resetsAtMs && agent.resetsAtMs > nowMs) {
      timeStr = resetTimerDisplayMode === "absolute"
        ? formatAbsoluteResetTime(agent.resetsAtMs)
        : formatCompactTimeLeft(nowMs, agent.resetsAtMs)
    }
    
    if (omitName) {
      return timeStr ? `${pct} ${timeStr}` : pct
    }
    return timeStr ? `${name} ${pct} ${timeStr}` : `${name} ${pct}`
  })
  const title = parts.join("  |  ")
  if (title.length <= 250) return title
  return `${title.slice(0, 247)}...`
}

export async function updateTrayStatusMenu(payload: TrayStatusMenuPayload): Promise<void> {
  await invoke("update_tray_status_menu", { payload })
}
