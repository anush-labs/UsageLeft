import { useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ProviderCard } from "@/components/provider-card"
import type { MetricLine, PluginDisplayState } from "@/lib/plugin-types"
import type { DisplayMode, ResetTimerDisplayMode, TimeFormatMode } from "@/lib/settings"

interface ProviderDetailPageProps {
  plugin: PluginDisplayState | null
  onRetry?: () => void
  displayMode: DisplayMode
  resetTimerDisplayMode: ResetTimerDisplayMode
  timeFormatMode?: TimeFormatMode
  onResetTimerDisplayModeToggle?: () => void
}

type DetailSelectProps = {
  id: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

function DetailSelect({ id, label, value, options, onChange }: DetailSelectProps) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-white/10 bg-[#111522] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-violet-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </section>
  )
}

function parseCopilotAccount(configText: string | null): string {
  if (!configText) return "auto"

  try {
    const parsed = JSON.parse(configText) as { account?: string | null }
    return typeof parsed.account === "string" && parsed.account.trim().length > 0
      ? parsed.account
      : "auto"
  } catch (error) {
    console.error("Failed to parse Copilot config:", error)
    return "auto"
  }
}

function CopilotAccountSwitcher({ onRetry }: { onRetry?: () => void }) {
  const [accounts, setAccounts] = useState<string[]>([])
  const [selectedAccount, setSelectedAccount] = useState("auto")

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      invoke<string[]>("list_github_accounts"),
      invoke<string | null>("read_plugin_config", { pluginId: "copilot" }),
    ])
      .then(([nextAccounts, configText]) => {
        if (cancelled) return
        setAccounts(nextAccounts)
        setSelectedAccount(parseCopilotAccount(configText))
      })
      .catch((error) => {
        console.error("Failed to load Copilot accounts:", error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const options = useMemo(() => {
    const unique = new Set(["auto", ...accounts])
    if (selectedAccount !== "auto") unique.add(selectedAccount)
    return Array.from(unique).map((account) => ({
      value: account,
      label: account === "auto" ? "Auto" : account,
    }))
  }, [accounts, selectedAccount])

  const handleChange = (value: string) => {
    setSelectedAccount(value)

    void invoke("write_plugin_config", {
      pluginId: "copilot",
      configJson: JSON.stringify({ account: value === "auto" ? null : value }),
    })
      .then(() => {
        onRetry?.()
      })
      .catch((error) => {
        console.error("Failed to update Copilot account:", error)
      })
  }

  return (
    <DetailSelect
      id="copilot-account-select"
      label="GitHub account"
      value={selectedAccount}
      options={options}
      onChange={handleChange}
    />
  )
}

function getAntigravityModelOptions(lines: MetricLine[]): string[] {
  return lines
    .filter((line) => line.type === "progress" && line.label !== "Tracked")
    .map((line) => line.label)
}

function getSelectedAntigravityModel(lines: MetricLine[], options: string[]): string {
  const trackedLine = lines.find(
    (line) => line.type === "progress" && line.label !== "Tracked" && line.color === "tracked"
  )
  if (trackedLine?.type === "progress") return trackedLine.label
  return options[0] ?? ""
}

function AntigravityModelSwitcher({ plugin, onRetry }: { plugin: PluginDisplayState; onRetry?: () => void }) {
  const options = useMemo(() => getAntigravityModelOptions(plugin.data?.lines ?? []), [plugin.data?.lines])
  const selectedValue = useMemo(
    () => getSelectedAntigravityModel(plugin.data?.lines ?? [], options),
    [options, plugin.data?.lines]
  )

  if (options.length === 0) return null

  return (
    <DetailSelect
      id="antigravity-model-select"
      label="Antigravity model"
      value={selectedValue}
      options={options.map((option) => ({ value: option, label: option }))}
      onChange={(value) => {
        void invoke("write_plugin_config", {
          pluginId: "antigravity",
          configJson: JSON.stringify({ trackedModel: value }),
        })
          .then(() => {
            onRetry?.()
          })
          .catch((error) => {
            console.error("Failed to update Antigravity model:", error)
          })
      }}
    />
  )
}

export function ProviderDetailPage({
  plugin,
  onRetry,
  displayMode,
  resetTimerDisplayMode,
  timeFormatMode = "auto",
  onResetTimerDisplayModeToggle,
}: ProviderDetailPageProps) {
  if (!plugin) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Provider not found
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {plugin.meta.id === "copilot" ? <CopilotAccountSwitcher onRetry={onRetry} /> : null}
      {plugin.meta.id === "antigravity" ? (
        <AntigravityModelSwitcher plugin={plugin} onRetry={onRetry} />
      ) : null}
      <ProviderCard
        name={plugin.meta.name}
        plan={plugin.data?.plan}
        links={plugin.meta.links}
        showSeparator={false}
        loading={plugin.loading}
        error={plugin.error}
        lines={plugin.data?.lines ?? []}
        skeletonLines={plugin.meta.lines}
        lastManualRefreshAt={plugin.lastManualRefreshAt}
        lastUpdatedAt={plugin.lastUpdatedAt}
        onRetry={onRetry}
        scopeFilter="all"
        displayMode={displayMode}
        resetTimerDisplayMode={resetTimerDisplayMode}
        timeFormatMode={timeFormatMode}
        onResetTimerDisplayModeToggle={onResetTimerDisplayModeToggle}
      />
    </div>
  )
}
