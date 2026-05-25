import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Copy, ExternalLink, GripVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { GlobalShortcutSection } from "@/components/global-shortcut-section";
import { getBarFillLayout, getTrayIconSizePx } from "@/lib/tray-bars-icon";
import {
  AUTO_UPDATE_OPTIONS,
  DISPLAY_MODE_OPTIONS,
  MENUBAR_ICON_STYLE_OPTIONS,
  RESET_TIMER_DISPLAY_OPTIONS,
  TIME_FORMAT_OPTIONS,
  type AutoUpdateIntervalMinutes,
  type DisplayMode,
  type GlobalShortcut,
  type MenubarIconStyle,
  type ResetTimerDisplayMode,
  type TimeFormatMode,
} from "@/lib/settings";
import { getTimeFormatter } from "@/lib/reset-tooltip";
import type { TraySettingsPreview } from "@/hooks/app/use-tray-icon";
import { cn } from "@/lib/utils";

interface PluginConfig {
  id: string;
  name: string;
  enabled: boolean;
  customColor?: string;
  originalBrandColor?: string;
}

const STATUS_BAR_COLORS = [
  // Light pastels
  "#fecdd3", "#fed7aa", "#fef08a", "#bbf7d0",
  "#99f6e4", "#bae6fd", "#c7d2fe", "#e9d5ff",
  // Vibrant
  "#f472b6", "#fb923c", "#facc15", "#4ade80",
  "#22d3ee", "#60a5fa", "#a78bfa", "#c084fc",
  // Neon/bright
  "#ff6b9d", "#e879f9", "#818cf8", "#34d399",
] as const

const TRAY_PREVIEW_SIZE_PX = getTrayIconSizePx(1);

const PREVIEW_BAR_TRACK_PX = 20;

function getPreviewBarLayout(fraction: number): { fillPercent: number; remainderPercent: number } {
  const { fillW, remainderDrawW } = getBarFillLayout(PREVIEW_BAR_TRACK_PX, fraction);
  return {
    fillPercent: (fillW / PREVIEW_BAR_TRACK_PX) * 100,
    remainderPercent: (remainderDrawW / PREVIEW_BAR_TRACK_PX) * 100,
  };
}

function ProviderIconMask({
  iconUrl,
  isActive,
  sizePx,
}: {
  iconUrl?: string;
  isActive: boolean;
  sizePx: number;
}) {
  const colorClass = isActive ? "bg-primary-foreground" : "bg-foreground";
  if (iconUrl) {
    return (
      <div
        aria-hidden
        className={cn("shrink-0", colorClass)}
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
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
    );
  }
  const textClass = isActive ? "text-primary-foreground" : "text-foreground";
  return (
    <svg aria-hidden viewBox="0 0 26 26" className={cn("shrink-0", textClass)} style={{ width: `${sizePx}px`, height: `${sizePx}px` }}>
      <circle cx="13" cy="13" r="9" fill="none" stroke="currentColor" strokeWidth="3.5" opacity={0.3} />
    </svg>
  );
}

function MenubarIconStylePreview({
  style,
  isActive,
  traySettingsPreview,
}: {
  style: MenubarIconStyle;
  isActive: boolean;
  traySettingsPreview: TraySettingsPreview;
}) {
  const textClass = isActive ? "text-primary-foreground" : "text-foreground";

  if (style === "provider") {
    return (
      <div className="inline-flex items-center gap-0.5">
        <ProviderIconMask
          iconUrl={traySettingsPreview.providerIconUrl}
          isActive={isActive}
          sizePx={TRAY_PREVIEW_SIZE_PX}
        />
        <span className={cn("text-[12px] font-semibold tabular-nums leading-none", textClass)}>
          {traySettingsPreview.providerPercentText}
        </span>
      </div>
    );
  }

  if (style === "agents") {
    const trackClass = isActive ? "bg-primary-foreground/15" : "bg-foreground/15";
    const remainderClass = isActive ? "bg-primary-foreground/20" : "bg-foreground/15";
    const fillClass = isActive ? "bg-primary-foreground" : "bg-foreground";
    const fractions = traySettingsPreview.bars.length > 0
      ? traySettingsPreview.bars.map((b) => b.fraction ?? 0)
      : [0.83, 0.7, 0.56];

    return (
      <div className="flex items-center">
        <div className="flex flex-col gap-0.5 w-5">
          {fractions.map((fraction, i) => {
            const { fillPercent, remainderPercent } = getPreviewBarLayout(fraction);
            return (
              <div key={i} className={cn("relative h-1 rounded-sm", trackClass)}>
                {remainderPercent > 0 && (
                  <span
                    aria-hidden
                    className={remainderClass}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: `${remainderPercent}%`,
                      borderRadius: "1px 2px 2px 1px",
                    }}
                  />
                )}
                <div
                  className={cn("h-1", fillClass)}
                  style={{ width: `${fillPercent}%`, borderRadius: "2px 1px 1px 2px" }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (style === "donut") {
    const fraction = traySettingsPreview.providerBars[0]?.fraction ?? 0;
    const clamped = Math.max(0, Math.min(1, fraction));
    return (
      <div className="inline-flex items-center gap-1">
        <ProviderIconMask
          iconUrl={traySettingsPreview.providerIconUrl}
          isActive={isActive}
          sizePx={TRAY_PREVIEW_SIZE_PX}
        />
        <svg aria-hidden viewBox="0 0 26 26" className={cn("shrink-0", textClass)} style={{ width: `${TRAY_PREVIEW_SIZE_PX}px`, height: `${TRAY_PREVIEW_SIZE_PX}px` }}>
          <circle
            cx="13" cy="13" r="9"
            fill="none" stroke="currentColor" strokeWidth="4"
            opacity={isActive ? 0.2 : 0.15}
          />
          {clamped > 0 && (
            <circle
              cx="13" cy="13" r="9"
              fill="none" stroke="currentColor" strokeWidth="4"
              strokeLinecap="butt"
              pathLength="100"
              strokeDasharray={`${Math.round(clamped * 100)} 100`}
              transform="rotate(-90 13 13)"
            />
          )}
        </svg>
      </div>
    );
  }

  return null;
}

function SortablePluginItem({
  plugin,
  onToggle,
  onColorChange,
}: {
  plugin: PluginConfig;
  onToggle: (id: string) => void;
  onColorChange: (id: string, color: string | undefined) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plugin.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const activeColor = plugin.customColor ?? plugin.originalBrandColor;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5",
        isDragging && "opacity-50"
      )}
    >
      {/* Top row: drag + name + toggle */}
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => onToggle(plugin.id)}>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="touch-none cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Active color dot */}
        <span
          className="size-2 shrink-0 rounded-full ring-1 ring-white/20"
          style={{ backgroundColor: activeColor ?? "#6b7280" }}
        />

        <span className={cn("flex-1 text-sm font-medium", !plugin.enabled && "text-gray-600")}>
          {plugin.name}
        </span>

        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            key={`${plugin.id}-${plugin.enabled}`}
            checked={plugin.enabled}
            onCheckedChange={() => onToggle(plugin.id)}
          />
        </span>
      </div>

      {/* Color swatch row */}
      <div className="mt-2 flex flex-wrap items-center gap-1 pl-7">
        <span className="mr-0.5 text-[10px] text-gray-600">Status bar:</span>
        {STATUS_BAR_COLORS.map((color) => {
          const isSelected = plugin.customColor === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={color}
              title={color}
              onClick={() => onColorChange(plugin.id, isSelected ? undefined : color)}
              className="size-4 rounded-full transition-all duration-100"
              style={{
                backgroundColor: color,
                outline: isSelected ? `2px solid ${color}` : "none",
                outlineOffset: "2px",
                opacity: isSelected ? 1 : 0.7,
                transform: isSelected ? "scale(1.25)" : "scale(1)",
              }}
            />
          );
        })}
        {plugin.customColor && (
          <button
            type="button"
            onClick={() => onColorChange(plugin.id, undefined)}
            className="ml-0.5 text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            title="Reset to brand color"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

interface SettingsPageProps {
  plugins: PluginConfig[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  onColorChange: (id: string, color: string | undefined) => void;
  autoUpdateInterval: AutoUpdateIntervalMinutes;
  onAutoUpdateIntervalChange: (value: AutoUpdateIntervalMinutes) => void;
  displayMode: DisplayMode;
  onDisplayModeChange: (value: DisplayMode) => void;
  resetTimerDisplayMode: ResetTimerDisplayMode;
  onResetTimerDisplayModeChange: (value: ResetTimerDisplayMode) => void;
  timeFormatMode: TimeFormatMode;
  onTimeFormatModeChange: (value: TimeFormatMode) => void;
  menubarIconStyle: MenubarIconStyle;
  onMenubarIconStyleChange: (value: MenubarIconStyle) => void;
  traySettingsPreview: TraySettingsPreview;
  globalShortcut: GlobalShortcut;
  onGlobalShortcutChange: (value: GlobalShortcut) => void;
  startOnLogin: boolean;
  onStartOnLoginChange: (value: boolean) => void;
}

export function SettingsPage({
  plugins,
  onReorder,
  onToggle,
  onColorChange,
  autoUpdateInterval,
  onAutoUpdateIntervalChange,
  displayMode,
  onDisplayModeChange,
  resetTimerDisplayMode,
  onResetTimerDisplayModeChange,
  timeFormatMode,
  onTimeFormatModeChange,
  menubarIconStyle,
  onMenubarIconStyleChange,
  traySettingsPreview,
  globalShortcut,
  onGlobalShortcutChange,
  startOnLogin,
  onStartOnLoginChange,
}: SettingsPageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = plugins.findIndex((item) => item.id === active.id);
      const newIndex = plugins.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(plugins, oldIndex, newIndex);
      onReorder(next.map((item) => item.id));
    }
  };

  return (
    <div className="py-3 space-y-4">
      <section>
        <h3 className="text-lg font-semibold mb-0">Auto Refresh</h3>
        <p className="text-sm text-muted-foreground mb-2">
          How obsessive are you
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Auto-update interval">
            {AUTO_UPDATE_OPTIONS.map((option) => {
              const isActive = option.value === autoUpdateInterval;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onAutoUpdateIntervalChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Usage Mode</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Glass half full or half empty
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Usage display mode">
            {DISPLAY_MODE_OPTIONS.map((option) => {
              const isActive = option.value === displayMode;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onDisplayModeChange(option.value)}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Reset Timers</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Countdown or clock time
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Reset timer display mode">
            {RESET_TIMER_DISPLAY_OPTIONS.map((option) => {
              const isActive = option.value === resetTimerDisplayMode;
              const absoluteTimeExample = getTimeFormatter(timeFormatMode).format(new Date(2026, 1, 2, 11, 4));
              const example = option.value === "relative" ? "5h 12m" : `today at ${absoluteTimeExample}`;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 flex flex-col items-center gap-0 py-2 h-auto"
                  onClick={() => onResetTimerDisplayModeChange(option.value)}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {example}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Time Format</h3>
        <p className="text-sm text-muted-foreground mb-2">
          12-hour or 24-hour clock
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Time format">
            {TIME_FORMAT_OPTIONS.map((option) => {
              const isActive = option.value === timeFormatMode;
              const example = getTimeFormatter(option.value).format(new Date(2026, 1, 2, 11, 4));
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={option.label}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 flex flex-col items-center gap-0 py-2 h-auto"
                  onClick={() => onTimeFormatModeChange(option.value)}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {example}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-lg font-semibold mb-0">Status Indicator Icon</h3>
        <p className="text-sm text-muted-foreground mb-2">
          What shows in Ubuntu status menus
        </p>
        <div className="bg-muted/50 rounded-lg p-1">
          <div className="flex gap-1" role="radiogroup" aria-label="Status indicator icon style">
            {MENUBAR_ICON_STYLE_OPTIONS.map((option) => {
              const isActive = option.value === menubarIconStyle;
              return (
                <Button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-label={option.label}
                  aria-checked={isActive}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className="flex-1 h-9 flex items-center justify-center"
                  onClick={() => onMenubarIconStyleChange(option.value)}
                >
                  <MenubarIconStylePreview
                    style={option.value}
                    isActive={isActive}
                    traySettingsPreview={traySettingsPreview}
                  />
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <GlobalShortcutSection
        globalShortcut={globalShortcut}
        onGlobalShortcutChange={onGlobalShortcutChange}
      />
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <h3 className="text-sm font-semibold text-white mb-0.5">Start on Login</h3>
        <p className="text-xs text-gray-500 mb-3">UsageLeft starts when you sign in</p>
        <label className="flex items-center gap-3 cursor-pointer select-none group">
          <Checkbox
            key={`start-on-login-${startOnLogin}`}
            checked={startOnLogin}
            onCheckedChange={(checked) => onStartOnLoginChange(checked === true)}
          />
          <span className={cn("text-sm transition-colors", startOnLogin ? "text-white" : "text-gray-400 group-hover:text-gray-300")}>
            Start on login
          </span>
        </label>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-white mb-0.5">Plugins</h3>
        <p className="text-xs text-gray-500 mb-3">Your AI coding lineup — drag to reorder, pick a status bar color</p>
        <div className="space-y-1.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={plugins.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {plugins.map((plugin) => (
                <SortablePluginItem
                  key={plugin.id}
                  plugin={plugin}
                  onToggle={onToggle}
                  onColorChange={onColorChange}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </section>
      <WebApiSection />
    </div>
  );
}

function WebApiSection() {
  const [port, setPort] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    invoke<number | null>("get_local_http_port")
      .then(setPort)
      .catch(() => setPort(null));
  }, []);

  if (!port) return null;

  const url = `http://localhost:${port}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleOpen = () => {
    openUrl(url).catch(() => window.open(url, "_blank"));
  };

  return (
    <section>
      <h3 className="text-lg font-semibold mb-0">Web Dashboard</h3>
      <p className="text-sm text-muted-foreground mb-2">
        Access your usage stats from any browser on this machine
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2.5">
        <span className="flex-1 font-mono text-sm text-violet-300 select-all">{url}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-violet-400 transition-colors hover:bg-violet-500/15 hover:text-violet-300"
          aria-label="Copy URL"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleOpen}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-violet-400 transition-colors hover:bg-violet-500/15 hover:text-violet-300"
          aria-label="Open in browser"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>
    </section>
  );
}
