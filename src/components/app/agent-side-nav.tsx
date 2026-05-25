import { Settings } from "lucide-react"
import { getRelativeLuminance } from "@/lib/color"
import { cn } from "@/lib/utils"
import type { NavPlugin } from "@/components/side-nav"

function getIconFg(brandColor: string | undefined): string {
  if (!brandColor) return "#ffffff"
  return getRelativeLuminance(brandColor) > 0.7 ? "#111827" : "#ffffff"
}

type AgentSideNavProps = {
  activeView: string
  navPlugins: NavPlugin[]
  onViewChange: (view: string) => void
}

export function AgentSideNav({ activeView, navPlugins, onViewChange }: AgentSideNavProps) {
  return (
    <div
      className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-3 scrollbar-none"
      style={{
        background: "rgba(8, 9, 18, 0.8)",
        backdropFilter: "blur(12px)",
        borderColor: "rgba(255,255,255,0.05)",
      }}
    >
      {navPlugins.map((plugin) => {
        const active = activeView === plugin.id
        const fg = getIconFg(plugin.brandColor)
        return (
          <button
            key={plugin.id}
            type="button"
            onClick={() => onViewChange(plugin.id)}
            title={plugin.name}
            aria-label={plugin.name}
            aria-pressed={active}
            className={cn(
              "group relative flex size-9 items-center justify-center rounded-xl transition-all duration-150",
              active
                ? "shadow-[0_0_14px_rgba(168,85,247,0.35)]"
                : "hover:bg-white/5",
            )}
            style={
              active
                ? {
                    background: `${plugin.brandColor}22`,
                    border: `1px solid ${plugin.brandColor}55`,
                  }
                : { background: "transparent", border: "1px solid transparent" }
            }
          >
            {/* Active indicator bar */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-y-2 left-0 w-0.5 rounded-full"
                style={{ backgroundColor: plugin.brandColor ?? "#a855f7" }}
              />
            )}
            <span
              aria-hidden
              className="size-5"
              style={{
                backgroundColor: active ? (plugin.brandColor ?? "#a855f7") : fg,
                opacity: active ? 1 : 0.5,
                WebkitMaskImage: `url(${plugin.iconUrl})`,
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: `url(${plugin.iconUrl})`,
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
                transition: "opacity 0.15s",
              }}
            />
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
        className={cn(
          "group relative flex size-9 items-center justify-center rounded-xl border transition-all duration-150",
          activeView === "settings"
            ? "border-violet-500/40 bg-violet-500/15 shadow-[0_0_14px_rgba(168,85,247,0.25)]"
            : "border-transparent hover:bg-white/5",
        )}
      >
        {activeView === "settings" && (
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-violet-500"
          />
        )}
        <Settings
          className={cn(
            "size-4 transition-colors",
            activeView === "settings" ? "text-violet-400" : "text-gray-500 group-hover:text-gray-300",
          )}
        />
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
