import { invoke, isTauri } from "@tauri-apps/api/core"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

// ── Types ──────────────────────────────────────────────────────────────────

interface TokenBucket {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

interface UsagePeriod {
  label: string
  buckets: Record<string, TokenBucket>
}

interface ClaudeUsageStats {
  daily: UsagePeriod[]
  weekly: UsagePeriod[]
  monthly: UsagePeriod[]
}

type Period = "daily" | "weekly" | "monthly"

// ── Model colour palette ───────────────────────────────────────────────────

const MODEL_COLORS: Record<string, string> = {
  "claude-opus":    "#f59e0b",   // amber
  "claude-sonnet":  "#a855f7",   // violet
  "claude-haiku":   "#22d3ee",   // cyan
  "claude-3":       "#6366f1",   // indigo fallback
}

function modelColor(model: string): string {
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (model.toLowerCase().includes(key.replace("claude-", ""))) return color
  }
  return "#8b5cf6"
}

function modelShortName(model: string): string {
  // "claude-sonnet-4-6" → "Sonnet 4.6"
  const m = model.replace(/^claude-/, "")
  const parts = m.split("-")
  if (parts.length >= 3) {
    const [family, major, minor] = parts
    return `${family.charAt(0).toUpperCase() + family.slice(1)} ${major}.${minor}`
  }
  return m.charAt(0).toUpperCase() + m.slice(1)
}

// ── Helpers ────────────────────────────────────────────────────────────────

function totalTokens(b: TokenBucket): number {
  return b.input_tokens + b.output_tokens + b.cache_creation_tokens + b.cache_read_tokens
}

function periodTotalTokens(p: UsagePeriod): number {
  return Object.values(p.buckets).reduce((s, b) => s + totalTokens(b), 0)
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function fmtLabel(label: string, period: Period): string {
  if (period === "daily") {
    const d = new Date(label + "T00:00:00")
    return d.toLocaleDateString("en", { month: "short", day: "numeric" })
  }
  if (period === "weekly") return label.replace(/^\d{4}-/, "")
  // monthly: "2025-05" → "May"
  const [y, m] = label.split("-")
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en", { month: "short", year: "2-digit" })
}

// ── Bar chart ─────────────────────────────────────────────────────────────

function UsageBar({
  period,
  maxTokens,
  hover,
  onHover,
}: {
  period: UsagePeriod
  maxTokens: number
  hover: boolean
  onHover: (on: boolean) => void
}) {
  const total = periodTotalTokens(period)
  const heightPct = maxTokens > 0 ? (total / maxTokens) * 100 : 0
  const models = Object.entries(period.buckets).sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))

  return (
    <div
      className="relative flex flex-1 flex-col items-center gap-1"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      {/* Tooltip */}
      {hover && total > 0 && (
        <div
          className="pointer-events-none absolute bottom-[calc(100%+6px)] z-20 min-w-[130px] rounded-xl border border-white/10 bg-[#0f1120]/90 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl"
          style={{ boxShadow: "0 0 20px rgba(168,85,247,0.15)" }}
        >
          <div className="mb-1.5 font-semibold text-white">{fmtTokens(total)} tokens</div>
          {models.map(([model, bucket]) => (
            <div key={model} className="flex items-center gap-1.5 py-0.5">
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: modelColor(model) }}
              />
              <span className="text-gray-300">{modelShortName(model)}</span>
              <span className="ml-auto text-gray-400">{fmtTokens(totalTokens(bucket))}</span>
            </div>
          ))}
        </div>
      )}

      {/* Stacked bar */}
      <div
        className="relative w-full overflow-hidden rounded-t-md transition-all duration-300"
        style={{ height: `${Math.max(heightPct, total > 0 ? 2 : 0)}%` }}
      >
        {models.map(([model, bucket], i) => {
          const seg = maxTokens > 0 ? (totalTokens(bucket) / maxTokens) * 100 : 0
          return (
            <div
              key={model}
              className="absolute inset-x-0 transition-all duration-300"
              style={{
                height: `${seg}%`,
                bottom: `${models.slice(i + 1).reduce((s, [, b]) => s + (maxTokens > 0 ? (totalTokens(b) / maxTokens) * 100 : 0), 0)}%`,
                backgroundColor: modelColor(model),
                opacity: hover ? 1 : 0.75,
              }}
            />
          )
        })}
        {/* Glass sheen */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ClaudeUsageChart({ pluginId }: { pluginId: string }) {
  const [stats, setStats] = useState<ClaudeUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("daily")
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    setLoading(true)
    invoke<ClaudeUsageStats>("get_claude_usage_stats")
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const periods = useMemo(() => {
    if (!stats) return []
    const all = stats[period]
    // Keep last N buckets
    const limit = period === "daily" ? 14 : period === "weekly" ? 12 : 12
    return all.slice(-limit)
  }, [stats, period])

  const allModels = useMemo(() => {
    const set = new Set<string>()
    for (const p of periods) Object.keys(p.buckets).forEach((m) => set.add(m))
    return [...set].sort()
  }, [periods])

  const maxTokens = useMemo(
    () => Math.max(...periods.map(periodTotalTokens), 1),
    [periods],
  )

  const grandTotal = useMemo(
    () => periods.reduce((s, p) => s + periodTotalTokens(p), 0),
    [periods],
  )

  if (!["claude", "anthropic"].some((id) => pluginId.includes(id))) return null

  return (
    <div
      className="rounded-2xl border border-white/[0.08] p-4"
      style={{
        background: "rgba(15, 17, 32, 0.6)",
        backdropFilter: "blur(20px) saturate(150%)",
        boxShadow: "0 0 0 1px rgba(168,85,247,0.08), 0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Token Usage</p>
          {!loading && grandTotal > 0 && (
            <p className="text-2xl font-bold text-white">
              {fmtTokens(grandTotal)}
              <span className="ml-1.5 text-sm font-normal text-gray-400">
                this {period === "daily" ? "14 days" : period === "weekly" ? "12 weeks" : "12 months"}
              </span>
            </p>
          )}
        </div>

        {/* Period toggle */}
        <div
          className="flex gap-0.5 rounded-lg p-0.5"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {(["daily", "weekly", "monthly"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-all",
                period === p
                  ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                  : "text-gray-400 hover:text-white",
              )}
            >
              {p === "daily" ? "Day" : p === "weekly" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex h-28 items-center justify-center">
          <div className="size-5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-500" />
        </div>
      ) : periods.length === 0 || grandTotal === 0 ? (
        <div className="flex h-28 flex-col items-center justify-center gap-1">
          <p className="text-sm text-gray-500">No usage data yet</p>
          <p className="text-xs text-gray-600">Data reads from ~/.claude/projects/</p>
        </div>
      ) : (
        <>
          {/* Bar area */}
          <div className="relative mb-1">
            {/* Grid lines */}
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-px w-full bg-white/[0.04]" />
              ))}
            </div>

            <div
              className="flex items-end gap-0.5"
              style={{ height: "112px" }}
            >
              {periods.map((p, i) => (
                <UsageBar
                  key={p.label}
                  period={p}
                  maxTokens={maxTokens}
                  hover={hoveredIdx === i}
                  onHover={(on) => setHoveredIdx(on ? i : null)}
                />
              ))}
            </div>
          </div>

          {/* X-axis labels — show every Nth to avoid crowding */}
          <div className="flex gap-0.5">
            {periods.map((p, i) => {
              const step = periods.length > 10 ? Math.ceil(periods.length / 7) : 1
              const show = i === 0 || i === periods.length - 1 || i % step === 0
              return (
                <div key={p.label} className="flex-1 text-center">
                  {show && (
                    <span className="text-[9px] text-gray-600">{fmtLabel(p.label, period)}</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          {allModels.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {allModels.map((model) => (
                <div key={model} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: modelColor(model) }}
                  />
                  <span className="text-[11px] text-gray-400">{modelShortName(model)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
