import { Gauge, Power, RefreshCw, Settings } from "lucide-react"
import { AppLogo } from "@/components/app-logo"
import { getRelativeLuminance } from "@/lib/color"
import type { NavPlugin } from "@/components/side-nav"
import { cn } from "@/lib/utils"

function getIconFg(brandColor: string | undefined): string {
  if (!brandColor) return "#ffffff"
  return getRelativeLuminance(brandColor) > 0.7 ? "#111827" : "#ffffff"
}

function NavTab({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-white/10 text-white"
          : "text-gray-400 hover:bg-white/5 hover:text-white",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-violet-500"
        />
      )}
      {children}
    </button>
  )
}

type TopNavProps = {
  activeView: string
  navPlugins: NavPlugin[]
  onViewChange: (view: string) => void
  onRefreshAll: () => void
  onQuitApp: () => void
}

export function TopNav({
  activeView,
  navPlugins,
  onViewChange,
  onRefreshAll,
  onQuitApp,
}: TopNavProps) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#080a12] px-3 py-2">
      {/* Logo */}
      <button
        type="button"
        onClick={() => onViewChange("home")}
        className="mr-2 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-white/5"
        aria-label="Home"
      >
        <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-600 shadow-[0_0_16px_rgba(168,85,247,0.3)]">
          <AppLogo className="size-4" />
        </div>
        <span className="text-sm font-semibold text-white">UsageLeft</span>
      </button>

      <div className="mx-1 h-4 w-px bg-white/10" aria-hidden />

      {/* Home tab */}
      <NavTab active={activeView === "home"} label="Dashboard" onClick={() => onViewChange("home")}>
        <Gauge className="size-3.5" />
        <span>Dashboard</span>
      </NavTab>

      {/* Plugin tabs */}
      {navPlugins.map((plugin) => (
        <NavTab
          key={plugin.id}
          active={activeView === plugin.id}
          label={plugin.name}
          onClick={() => onViewChange(plugin.id)}
        >
          <span
            aria-hidden
            className="size-3.5 shrink-0"
            style={{
              backgroundColor: getIconFg(plugin.brandColor),
              WebkitMaskImage: `url(${plugin.iconUrl})`,
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskImage: `url(${plugin.iconUrl})`,
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          />
          <span>{plugin.name}</span>
        </NavTab>
      ))}

      <div className="mx-1 h-4 w-px bg-white/10" aria-hidden />

      {/* Settings tab */}
      <NavTab
        active={activeView === "settings"}
        label="Settings"
        onClick={() => onViewChange("settings")}
      >
        <Settings className="size-3.5" />
        <span>Settings</span>
      </NavTab>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refresh */}
      <button
        type="button"
        onClick={onRefreshAll}
        className="flex size-7 items-center justify-center rounded-md border border-white/[0.08] bg-white/5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Refresh"
      >
        <RefreshCw className="size-3.5" />
      </button>

      {/* Quit */}
      <button
        type="button"
        onClick={onQuitApp}
        className="ml-1 flex size-7 items-center justify-center rounded-md border border-red-500/20 bg-red-500/5 text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
        aria-label="Quit"
      >
        <Power className="size-3.5" />
      </button>
    </div>
  )
}
