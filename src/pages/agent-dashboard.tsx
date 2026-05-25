import type { ReactNode, RefObject } from "react"
import { Gauge, Power, RefreshCw, Settings } from "lucide-react"
import { AppLogo } from "@/components/app-logo"
import { getRelativeLuminance } from "@/lib/color"
import type { PluginDisplayState } from "@/lib/plugin-types"
import { clamp01 } from "@/lib/utils"

type AgentDashboardProps = {
  plugins: PluginDisplayState[]
  scrollRef: RefObject<HTMLDivElement | null>
  onRefreshAll: () => void
  onOpenPlugin: (pluginId: string) => void
  onOpenSettings: () => void
  onQuitApp: () => void
}

type DashboardMetric = {
  fraction: number
  pctLeft: number | null
  timeLeftText: string
}

function getPrimaryProgressLine(plugin: PluginDisplayState) {
  const lines = plugin.data?.lines ?? []

  for (const label of plugin.meta.primaryCandidates) {
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

function getIconForeground(brandColor: string): string {
  return getRelativeLuminance(brandColor) > 0.7 ? "#111827" : "#ffffff"
}

function PluginIconBadge({
  iconUrl,
  brandColor,
  name,
}: {
  iconUrl: string
  brandColor: string
  name: string
}) {
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: brandColor }}
      aria-hidden="true"
    >
      <span
        role="img"
        aria-label={name}
        className="size-4"
        style={{
          backgroundColor: getIconForeground(brandColor),
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

function BottomNavButton({
  active = false,
  destructive = false,
  icon,
  label,
  onClick,
}: {
  active?: boolean
  destructive?: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
        active ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white",
        destructive ? "text-red-400 hover:bg-red-500/10 hover:text-red-300" : "",
      ].join(" ")}
      aria-pressed={active}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function AgentDashboard({
  plugins,
  scrollRef,
  onRefreshAll,
  onOpenPlugin,
  onOpenSettings,
  onQuitApp,
}: AgentDashboardProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f111a] text-white">
      <div className="border-b border-white/5 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-7 items-center justify-center rounded-md bg-linear-to-br from-violet-500 via-fuchsia-500 to-indigo-500 shadow-[0_0_24px_rgba(168,85,247,0.28)]">
              <AppLogo className="size-5 rounded-[22%]" />
            </div>
            <span className="text-base font-semibold tracking-tight">UsageLeft</span>
          </div>
          <button
            type="button"
            onClick={onRefreshAll}
            className="flex size-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Refresh agents"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-none">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          Active agents
        </div>

        {plugins.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-6 text-sm text-gray-400">
            No agents enabled
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {plugins.map((plugin) => {
              const brandColor = plugin.meta.brandColor || "#a855f7"
              const metric = getDashboardMetric(plugin)

              return (
                <button
                  key={plugin.meta.id}
                  type="button"
                  onClick={() => onOpenPlugin(plugin.meta.id)}
                  className="flex min-h-28 flex-col rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.05]"
                  aria-label={plugin.meta.name}
                >
                  <PluginIconBadge
                    iconUrl={plugin.meta.iconUrl}
                    brandColor={brandColor}
                    name={plugin.meta.name}
                  />
                  <div className="mt-3 truncate text-sm font-semibold text-white">{plugin.meta.name}</div>
                  <div className="mt-1 font-mono text-xs text-sky-400">
                    {metric.pctLeft === null ? "--% left" : `${metric.pctLeft}% left`}
                  </div>
                  <div className="font-mono text-xs text-gray-500">{metric.timeLeftText}</div>
                  <div className="mt-auto pt-3">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${metric.fraction * 100}%`,
                          backgroundColor: brandColor,
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

      <div className="flex gap-2 border-t border-white/5 px-3 py-3">
        <BottomNavButton
          active
          icon={<Gauge className="size-4" />}
          label="Dashboard"
          onClick={() => undefined}
        />
        <BottomNavButton
          icon={<Settings className="size-4" />}
          label="Settings"
          onClick={onOpenSettings}
        />
        <BottomNavButton
          destructive
          icon={<Power className="size-4" />}
          label="Quit"
          onClick={onQuitApp}
        />
      </div>
    </div>
  )
}
