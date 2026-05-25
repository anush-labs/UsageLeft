import { useCallback, useEffect, useRef, useState } from "react"
import { resolveResource } from "@tauri-apps/api/path"
import { TrayIcon } from "@tauri-apps/api/tray"
import type { PluginMeta } from "@/lib/plugin-types"
import type { DisplayMode, MenubarAgentCount, MenubarIconStyle, MenubarLogoColor, PluginSettings, ResetTimerDisplayMode } from "@/lib/settings"
import { getEnabledPluginIds } from "@/lib/settings"
import { getTrayIconSizePx, renderTrayBarsIcon } from "@/lib/tray-bars-icon"
import { getTrayPrimaryBars, type TrayPrimaryBar } from "@/lib/tray-primary-progress"
import { buildTrayIndicatorTitle, buildTrayStatusMenuPayload, updateTrayStatusMenu, buildTrayIndicatorTextSegments } from "@/lib/tray-status-menu"
import { formatTrayPercentText, formatTrayTooltip } from "@/lib/tray-tooltip"
import type { PluginState } from "@/hooks/app/types"

type TrayUpdateReason = "probe" | "settings" | "init"

type UseTrayIconArgs = {
  pluginsMeta: PluginMeta[]
  pluginSettings: PluginSettings | null
  pluginStates: Record<string, PluginState>
  displayMode: DisplayMode
  menubarIconStyle: MenubarIconStyle
  menubarAgentCount: MenubarAgentCount
  menubarLogoColor: MenubarLogoColor
  resetTimerDisplayMode: ResetTimerDisplayMode
  activeView: string
}

export type TraySettingsPreview = {
  bars: TrayPrimaryBar[]
  providerBars: TrayPrimaryBar[]
  providerIconUrl?: string
  providerPercentText: string
}

const EMPTY_TRAY_SETTINGS_PREVIEW: TraySettingsPreview = {
  bars: [],
  providerBars: [],
  providerPercentText: "--%",
}

const UBUNTU_TRAY_FOREGROUND = "#ffffff"
const TEXT_MODE_TRAY_FOREGROUND = "#c4b5fd"

function isSameTraySettingsPreview(a: TraySettingsPreview, b: TraySettingsPreview): boolean {
  if (a.providerIconUrl !== b.providerIconUrl) return false
  if (a.providerPercentText !== b.providerPercentText) return false
  if (a.bars.length !== b.bars.length) return false
  if (a.providerBars.length !== b.providerBars.length) return false
  for (let i = 0; i < a.bars.length; i += 1) {
    if (a.bars[i]?.id !== b.bars[i]?.id) return false
    if (a.bars[i]?.fraction !== b.bars[i]?.fraction) return false
  }
  for (let i = 0; i < a.providerBars.length; i += 1) {
    if (a.providerBars[i]?.id !== b.providerBars[i]?.id) return false
    if (a.providerBars[i]?.fraction !== b.providerBars[i]?.fraction) return false
  }
  return true
}

export function useTrayIcon({
  pluginsMeta,
  pluginSettings,
  pluginStates,
  displayMode,
  menubarIconStyle,
  menubarAgentCount,
  menubarLogoColor,
  resetTimerDisplayMode,
  activeView,
}: UseTrayIconArgs) {
  const trayRef = useRef<TrayIcon | null>(null)
  const trayGaugeIconPathRef = useRef<string | null>(null)
  const trayUpdateTimerRef = useRef<number | null>(null)
  const trayUpdatePendingRef = useRef(false)
  const trayUpdateQueuedRef = useRef(false)
  const [trayReady, setTrayReady] = useState(false)
  const [traySettingsPreview, setTraySettingsPreview] = useState<TraySettingsPreview>(
    EMPTY_TRAY_SETTINGS_PREVIEW
  )

  const pluginsMetaRef = useRef(pluginsMeta)
  const pluginSettingsRef = useRef(pluginSettings)
  const pluginStatesRef = useRef(pluginStates)
  const displayModeRef = useRef(displayMode)
  const menubarIconStyleRef = useRef(menubarIconStyle)
  const menubarAgentCountRef = useRef(menubarAgentCount)
  const menubarLogoColorRef = useRef(menubarLogoColor)
  const resetTimerDisplayModeRef = useRef(resetTimerDisplayMode)
  const activeViewRef = useRef(activeView)
  const lastTrayProviderIdRef = useRef<string | null>(null)

  useEffect(() => {
    pluginsMetaRef.current = pluginsMeta
  }, [pluginsMeta])

  useEffect(() => {
    pluginSettingsRef.current = pluginSettings
  }, [pluginSettings])

  useEffect(() => {
    pluginStatesRef.current = pluginStates
  }, [pluginStates])

  useEffect(() => {
    displayModeRef.current = displayMode
  }, [displayMode])

  useEffect(() => {
    menubarIconStyleRef.current = menubarIconStyle
  }, [menubarIconStyle])

  useEffect(() => {
    menubarAgentCountRef.current = menubarAgentCount
  }, [menubarAgentCount])

  useEffect(() => {
    menubarLogoColorRef.current = menubarLogoColor
  }, [menubarLogoColor])

  useEffect(() => {
    resetTimerDisplayModeRef.current = resetTimerDisplayMode
  }, [resetTimerDisplayMode])

  useEffect(() => {
    activeViewRef.current = activeView
  }, [activeView])

  const scheduleTrayIconUpdate = useCallback((
    _reason: TrayUpdateReason,
    delayMs = 0,
  ) => {
    if (trayUpdateTimerRef.current !== null) {
      window.clearTimeout(trayUpdateTimerRef.current)
      trayUpdateTimerRef.current = null
    }

    trayUpdateTimerRef.current = window.setTimeout(async () => {
      trayUpdateTimerRef.current = null
      if (trayUpdatePendingRef.current) {
        trayUpdateQueuedRef.current = true
        return
      }
      trayUpdatePendingRef.current = true

      const finalizeUpdate = () => {
        trayUpdatePendingRef.current = false
        if (!trayUpdateQueuedRef.current) return
        trayUpdateQueuedRef.current = false
        scheduleTrayIconUpdate("probe", 0)
      }

      const tray = trayRef.current
      if (!tray) {
        finalizeUpdate()
        return
      }

      const maybeSetTitle = (tray as TrayIcon & { setTitle?: (value: string) => Promise<void> }).setTitle
      const setTitleFn =
        typeof maybeSetTitle === "function" ? (value: string) => maybeSetTitle.call(tray, value) : null
      const supportsNativeTrayTitle = setTitleFn !== null
      const setTrayTitle = (title: string) => {
        if (setTitleFn) {
          return setTitleFn(title)
        }
        return Promise.resolve()
      }

      const maybeSetTooltip = (tray as TrayIcon & { setTooltip?: (value: string) => Promise<void> }).setTooltip
      const setTooltipFn =
        typeof maybeSetTooltip === "function" ? (value: string) => maybeSetTooltip.call(tray, value) : null
      const setTrayTooltip = (tooltip: string) => {
        if (setTooltipFn) {
          return setTooltipFn(tooltip)
        }
        return Promise.resolve()
      }

      const restoreGaugeIcon = () => {
        const gaugePath = trayGaugeIconPathRef.current
        if (gaugePath) {
          Promise.all([
            tray.setIcon(gaugePath),
            tray.setIconAsTemplate(true),
            setTrayTitle(""),
            setTrayTooltip("UsageLeft"),
          ])
            .catch((e) => {
              console.error("Failed to restore tray gauge icon:", e)
            })
            .finally(() => {
              finalizeUpdate()
            })
        } else {
          finalizeUpdate()
        }
      }

      const publishStatusMenu = (settings: PluginSettings | null) => {
        const payload = buildTrayStatusMenuPayload({
          pluginsMeta: pluginsMetaRef.current,
          pluginSettings: settings,
          pluginStates: pluginStatesRef.current,
          displayMode: displayModeRef.current,
        })
        void updateTrayStatusMenu(payload).catch((error) => {
          console.error("Failed to update tray status menu:", error)
        })
        return payload
      }

      const currentSettings = pluginSettingsRef.current
      if (!currentSettings) {
        setTraySettingsPreview(EMPTY_TRAY_SETTINGS_PREVIEW)
        publishStatusMenu(null)
        restoreGaugeIcon()
        return
      }

      const enabledPluginIds = getEnabledPluginIds(currentSettings)
      const statusPayload = publishStatusMenu(currentSettings)
      const configuredAgentCount = menubarAgentCountRef.current
      const indicatorTitle = buildTrayIndicatorTitle(statusPayload, configuredAgentCount, resetTimerDisplayModeRef.current)
      if (enabledPluginIds.length === 0) {
        setTraySettingsPreview(EMPTY_TRAY_SETTINGS_PREVIEW)
        restoreGaugeIcon()
        return
      }

      const style = menubarIconStyleRef.current
      const sizePx = getTrayIconSizePx(window.devicePixelRatio)
      const nextActiveView = activeViewRef.current
      const activeProviderId =
        nextActiveView !== "home" && nextActiveView !== "settings" ? nextActiveView : null

      const activeBars = getTrayPrimaryBars({
        pluginsMeta: pluginsMetaRef.current,
        pluginSettings: currentSettings,
        pluginStates: pluginStatesRef.current,
        maxBars: configuredAgentCount,
        displayMode: displayModeRef.current,
        activeOnly: true,
        includeLabels: true,
      })
      const activePluginIds = activeBars.map((bar) => bar.id)

      let trayProviderId: string | null = null
      if (activeProviderId && activePluginIds.includes(activeProviderId)) {
        trayProviderId = activeProviderId
      } else if (
        lastTrayProviderIdRef.current &&
        activePluginIds.includes(lastTrayProviderIdRef.current)
      ) {
        trayProviderId = lastTrayProviderIdRef.current
      } else {
        trayProviderId = activePluginIds[0] ?? null
      }

      const barsForPreview = activeBars.slice(0, configuredAgentCount)

      const providerBars = trayProviderId
        ? getTrayPrimaryBars({
            pluginsMeta: pluginsMetaRef.current,
            pluginSettings: currentSettings,
            pluginStates: pluginStatesRef.current,
            maxBars: 1,
            displayMode: displayModeRef.current,
            pluginId: trayProviderId,
            activeOnly: true,
          })
        : []

      const logoColor = menubarLogoColorRef.current
      const iconUrlForColor = (meta: PluginMeta): string | undefined => {
        if (!meta.iconUrl) return undefined
        if (logoColor === "white") return meta.iconUrl.replace(/\/icon\.svg$/, "/white-icon.svg")
        if (logoColor === "black") return meta.iconUrl.replace(/\/icon\.svg$/, "/black-icon.svg")
        return meta.iconUrl
      }

      const fetchAsBase64Url = async (urlRaw: string | undefined): Promise<string | undefined> => {
        if (!urlRaw) return undefined;
        try {
          const fetchUrl = urlRaw.startsWith("/") ? urlRaw : `/${urlRaw}`;
          const urlRes = await fetch(fetchUrl);
          if (urlRes.ok) {
            const svgText = await urlRes.text();
            const base64 = btoa(unescape(encodeURIComponent(svgText)));
            return `data:image/svg+xml;base64,${base64}`;
          }
        } catch (e) {
          console.error("Failed to fetch provider icon for tray:", e);
        }
        return undefined;
      };

      const providerIconUrlRaw = trayProviderId
        ? iconUrlForColor(pluginsMetaRef.current.find((plugin) => plugin.id === trayProviderId) ?? {} as PluginMeta)
        : undefined;

      const providerIconUrl = await fetchAsBase64Url(providerIconUrlRaw);

      let providerIconUrls: (string | undefined)[] | undefined = undefined;
      if (style === "agents") {
        const rawUrls = barsForPreview.map(bar => 
          iconUrlForColor(pluginsMetaRef.current.find(p => p.id === bar.id) ?? {} as PluginMeta)
        );
        providerIconUrls = await Promise.all(rawUrls.map(fetchAsBase64Url));
      }

      const providerPercentText = formatTrayPercentText(providerBars[0]?.fraction)

      const nextPreview: TraySettingsPreview = {
        bars: barsForPreview,
        providerBars,
        providerIconUrl,
        providerPercentText,
      }
      setTraySettingsPreview((prev) =>
        isSameTraySettingsPreview(prev, nextPreview) ? prev : nextPreview
      )

      const tooltipBars = getTrayPrimaryBars({
        pluginsMeta: pluginsMetaRef.current,
        pluginSettings: currentSettings,
        pluginStates: pluginStatesRef.current,
        maxBars: 20, // Show more in tooltip
        displayMode: displayModeRef.current,
        activeOnly: true,
      })
      const tooltip = formatTrayTooltip(tooltipBars, pluginsMetaRef.current)
      const updateTooltip = () => setTrayTooltip(tooltip || "UsageLeft")
      const updateIndicatorTitle = (omitText = false, omitName = false) => {
        if (omitText) return setTrayTitle("")
        if (omitName && trayProviderId) {
          return setTrayTitle(buildTrayIndicatorTitle(statusPayload, 1, resetTimerDisplayModeRef.current, true, trayProviderId))
        }
        return setTrayTitle(indicatorTitle)
      }

      if (style === "agents") {
        renderTrayBarsIcon({
          bars: barsForPreview,
          sizePx,
          style: "agents",
          providerIconUrls: providerIconUrls as string[],
          foregroundColor: UBUNTU_TRAY_FOREGROUND,
        })
          .then(async (img) => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(false)
            await updateIndicatorTitle(false, false)
            await updateTooltip()
          })
          .catch((e) => {
            console.error("Failed to update tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }

      if (style === "text") {
        const textSegments = buildTrayIndicatorTextSegments(statusPayload, configuredAgentCount, resetTimerDisplayModeRef.current)
        renderTrayBarsIcon({
          bars: [],
          sizePx,
          style: "text",
          percentText: indicatorTitle,
          textSegments,
          foregroundColor: TEXT_MODE_TRAY_FOREGROUND,
        })
          .then(async (img) => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(false)
            await updateIndicatorTitle(true, false)
            await updateTooltip()
          })
          .catch((e) => {
            console.error("Failed to update tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }



      if (!trayProviderId) {
        renderTrayBarsIcon({
          bars: [],
          sizePx,
          style,
          foregroundColor: UBUNTU_TRAY_FOREGROUND,
        })
          .then(async (img) => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(false)
            await updateIndicatorTitle(true, false)
            await updateTooltip()
          })
          .catch((e) => {
            console.error("Failed to update tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }
      lastTrayProviderIdRef.current = trayProviderId

      if (style === "donut") {
        renderTrayBarsIcon({
          bars: providerBars,
          sizePx,
          style: "donut",
          providerIconUrl,
          foregroundColor: UBUNTU_TRAY_FOREGROUND,
        })
          .then(async (img) => {
            await tray.setIcon(img)
            await tray.setIconAsTemplate(false)
            await updateIndicatorTitle(false, true)
            await updateTooltip()
          })
          .catch((e) => {
            console.error("Failed to update tray icon:", e)
          })
          .finally(() => {
            finalizeUpdate()
          })
        return
      }

      renderTrayBarsIcon({
        bars: providerBars,
        sizePx,
        style: "provider",
        percentText: supportsNativeTrayTitle ? undefined : providerPercentText,
        providerIconUrl,
        foregroundColor: UBUNTU_TRAY_FOREGROUND,
      })
        .then(async (img) => {
          await tray.setIcon(img)
          await tray.setIconAsTemplate(false)
          await updateIndicatorTitle(false, true)
          await updateTooltip()
        })
        .catch((e) => {
          console.error("Failed to update tray icon:", e)
        })
        .finally(() => {
          finalizeUpdate()
        })
    }, delayMs)
  }, [])

  const trayInitializedRef = useRef(false)
  useEffect(() => {
    if (trayInitializedRef.current) return
    let cancelled = false

    ;(async () => {
      try {
        const tray = await TrayIcon.getById("tray")
        if (cancelled) return
        trayRef.current = tray
        trayInitializedRef.current = true

        try {
          trayGaugeIconPathRef.current = await resolveResource("icons/tray-icon.png")
        } catch (e) {
          console.error("Failed to resolve tray gauge icon resource:", e)
        }

        if (cancelled) return
        setTrayReady(true)
      } catch (e) {
        console.error("Failed to load tray icon handle:", e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!trayReady) return
    if (!pluginSettings) return
    if (pluginsMeta.length === 0) return
    scheduleTrayIconUpdate("init", 0)
  }, [pluginsMeta.length, pluginSettings, scheduleTrayIconUpdate, trayReady])

  useEffect(() => {
    if (!trayReady) return
    scheduleTrayIconUpdate("settings", 0)
  }, [activeView, menubarAgentCount, menubarIconStyle, scheduleTrayIconUpdate, trayReady])

  useEffect(() => {
    return () => {
      if (trayUpdateTimerRef.current !== null) {
        window.clearTimeout(trayUpdateTimerRef.current)
        trayUpdateTimerRef.current = null
      }
      trayUpdatePendingRef.current = false
      trayUpdateQueuedRef.current = false
    }
  }, [])

  return {
    scheduleTrayIconUpdate,
    traySettingsPreview,
  }
}
