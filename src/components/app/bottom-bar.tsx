import { cn } from "@/lib/utils"

type BottomBarProps = {
  activeView: string
  onViewChange: (view: string) => void
  onQuitApp: () => void
}

function BarButton({
  active,
  destructive,
  label,
  onClick,
}: {
  active?: boolean
  destructive?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex flex-1 items-center justify-center rounded-xl py-2 text-sm font-bold tracking-wide transition-all duration-150",
        active && !destructive && "bg-violet-600/20 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.2)]",
        !active && !destructive && "text-gray-400 hover:bg-white/5 hover:text-gray-200",
        destructive && "text-red-400/70 hover:bg-red-500/10 hover:text-red-400",
      )}
    >
      {label}
    </button>
  )
}

export function BottomBar({ activeView, onViewChange, onQuitApp }: BottomBarProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 border-t px-3 py-2"
      style={{
        background: "rgba(8, 9, 18, 0.85)",
        backdropFilter: "blur(16px)",
        borderColor: "rgba(255,255,255,0.06)",
      }}
    >
      <BarButton
        active={activeView === "home"}
        label="Dashboard"
        onClick={() => onViewChange("home")}
      />
      <BarButton
        active={activeView === "settings"}
        label="Settings"
        onClick={() => onViewChange("settings")}
      />
      <BarButton
        destructive
        label="Quit"
        onClick={onQuitApp}
      />
    </div>
  )
}
