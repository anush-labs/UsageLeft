import { Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavPlugin } from "@/components/side-nav"

type AgentSideNavProps = {
  activeView: string
  navPlugins: NavPlugin[]
  onViewChange: (view: string) => void
}

export function AgentSideNav({ activeView, navPlugins, onViewChange }: AgentSideNavProps) {
  return (
    <div
      className="flex w-14 shrink-0 flex-col items-center gap-2 overflow-y-auto border-r py-3 scrollbar-none"
      style={{
        background: "rgba(8, 9, 18, 0.85)",
        backdropFilter: "blur(12px)",
        borderColor: "rgba(255,255,255,0.05)",
      }}
    >
      {navPlugins.map((plugin) => {
        const active = activeView === plugin.id
        const color = plugin.brandColor ?? "#a855f7"
        return (
          <button
            key={plugin.id}
            type="button"
            onClick={() => onViewChange(plugin.id)}
            title={plugin.name}
            aria-label={plugin.name}
            aria-pressed={active}
            className="group relative flex items-center justify-center transition-all duration-150"
          >
            {/* App icon square */}
            <div
              className="flex size-10 items-center justify-center rounded-2xl transition-all duration-150"
              style={{
                backgroundColor: color,
                opacity: active ? 1 : 0.65,
                boxShadow: active ? `0 0 16px ${color}88` : "none",
                transform: active ? "scale(1.08)" : "scale(1)",
              }}
            >
              <span
                aria-hidden
                className="size-5"
                style={{
                  backgroundColor: "#ffffff",
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
            </div>
            {/* Tooltip */}
            <span
              className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0f1120]/95 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-xl backdrop-blur-xl transition-opacity group-hover:opacity-100"
              aria-hidden
            >
              {plugin.name}
            </span>
          </button>
        )
      })}

      {/* Divider */}
      <div className="my-1 w-6 border-t border-white/[0.07]" />

      {/* Settings */}
      <button
        type="button"
        onClick={() => onViewChange("settings")}
        title="Settings"
        aria-label="Settings"
        aria-pressed={activeView === "settings"}
        className="group relative flex items-center justify-center transition-all duration-150"
      >
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-2xl transition-all duration-150",
            activeView === "settings"
              ? "bg-violet-600 shadow-[0_0_16px_rgba(139,92,246,0.6)]"
              : "bg-white/10 hover:bg-white/20",
          )}
          style={{
            opacity: activeView === "settings" ? 1 : 0.65,
            transform: activeView === "settings" ? "scale(1.08)" : "scale(1)",
          }}
        >
          <Settings className="size-4 text-white" />
        </div>
        <span
          className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0f1120]/95 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-xl backdrop-blur-xl transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          Settings
        </span>
      </button>
    </div>
  )
}
