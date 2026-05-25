import type { RefObject } from "react"
import { RefreshCw } from "lucide-react"
import { AppLogo } from "@/components/app-logo"
import type { PluginDisplayState } from "@/lib/plugin-types"
import { clamp01 } from "@/lib/utils"

type AgentDashboardProps = {
  plugins: PluginDisplayState[]
  scrollRef: RefObject<HTMLDivElement | null>
  onRefreshAll: () => void
  onOpenPlugin: (pluginId: string) => void
}

type DashboardMetric = {
  fraction: number
  pctLeft: number | null
  timeLeftText: string
}

function getPrimaryProgressLine(plugin: PluginDisplayState) {
  const lines = plugin.data?.lines ?? []

  for (const label of plugin.meta.primaryCandidates ?? []) {
    const line = lines.find(
      (candidate) => candidate.type === "progress" && candidate.label === label
    )
    if (line?.type === "progress") {
      return line
    }
  }

  return lines.find((line) => line.type === "progress") ?? null
}

function formatResetTime(resetsAt?: string): string {
  if (!resetsAt) return "~--"

  const resetMs = Date.parse(resetsAt)
  if (!Number.isFinite(resetMs)) return "~--"

  const remainingMs = Math.max(0, resetMs - Date.now())
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))

  if (totalMinutes < 60) return `~${totalMinutes}m`

  const totalHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (totalHours < 24) {
    return minutes > 0 ? `~${totalHours}h ${minutes}m` : `~${totalHours}h`
  }

  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return hours > 0 ? `~${days}d ${hours}h` : `~${days}d`
}

function getDashboardMetric(plugin: PluginDisplayState): DashboardMetric {
  const line = getPrimaryProgressLine(plugin)
  if (!line || !Number.isFinite(line.limit) || line.limit <= 0) {
    return { fraction: 0, pctLeft: null, timeLeftText: "~--" }
  }

  const fraction = clamp01(line.used / line.limit)
  return {
    fraction,
    pctLeft: Math.round((1 - fraction) * 100),
    timeLeftText: formatResetTime(line.resetsAt),
  }
}

function PluginIconBadge({ iconUrl, brandColor, name }: { iconUrl: string; brandColor: string; name: string }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-2xl"
      style={{ backgroundColor: brandColor }}
      aria-hidden="true"
    >
      <span
        role="img"
        aria-label={name}
        className="size-5"
        style={{
          backgroundColor: "#ffffff",
          WebkitMaskImage: `url(${iconUrl})`,
          WebkitMaskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskImage: `url(${iconUrl})`,
          maskSize: "contain",
          maskRepeat: "no-repeat",
          maskPosition: "center",
        }}
      />
    </div>
  )
}


export function AgentDashboard({
  plugins,
  scrollRef,
  onRefreshAll,
  onOpenPlugin,
}: AgentDashboardProps) {
  return (
    <div className="flex h-full w-full min-h-0 flex-col text-white"
      style={{ background: "linear-gradient(135deg, #0d0f1e 0%, #0f1130 50%, #0d0f1e 100%)" }}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AppLogo className="size-8 rounded-lg" />
            <div>
              <span className="text-base font-semibold tracking-tight">UsageLeft</span>
              <p className="text-[11px] text-gray-500 leading-none mt-0.5">{plugins.length} active agent{plugins.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshAll}
            className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-gray-400 transition-all hover:bg-white/10 hover:text-white hover:border-white/20"
            aria-label="Refresh agents"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      {/* Grid content */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5 scrollbar-none">
        <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-600">
          Active agents
        </div>

        {plugins.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-6 py-10 text-center text-sm text-gray-500">
            No agents enabled — add one in Settings
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {plugins.map((plugin) => {
              const brandColor = plugin.meta.brandColor || "#a855f7"
              const metric = getDashboardMetric(plugin)

              return (
                <button
                  key={plugin.meta.id}
                  type="button"
                  onClick={() => onOpenPlugin(plugin.meta.id)}
                  className="group flex flex-col rounded-2xl border border-white/[0.07] p-4 text-left transition-all duration-150 hover:border-white/[0.15] hover:scale-[1.02]"
                  style={{
                    background: `linear-gradient(135deg, ${brandColor}0d 0%, transparent 60%)`,
                    boxShadow: `0 0 0 1px ${brandColor}18`,
                  }}
                  aria-label={plugin.meta.name}
                >
                  <div className="flex items-start justify-between gap-2">
                    <PluginIconBadge
                      iconUrl={plugin.meta.iconUrl}
                      brandColor={brandColor}
                      name={plugin.meta.name}
                    />
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${brandColor}22`,
                        color: brandColor,
                      }}
                    >
                      {metric.pctLeft === null ? "--%" : `${metric.pctLeft}%`}
                    </span>
                  </div>

                  <div className="mt-4 truncate text-sm font-semibold text-white group-hover:text-white/90">
                    {plugin.meta.name}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-gray-500">{metric.timeLeftText}</div>

                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">Usage</span>
                      <span className="font-mono text-[10px] text-gray-500">
                        {Math.round(metric.fraction * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${metric.fraction * 100}%`,
                          background: `linear-gradient(90deg, ${brandColor}cc, ${brandColor})`,
                          boxShadow: `0 0 6px ${brandColor}66`,
                        }}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
