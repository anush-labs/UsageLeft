import { useCallback } from "react"
import {
  saveDisplayMode,
  saveMenubarAgentCount,
  saveMenubarIconStyle,
  saveMenubarLogoColor,
  saveResetTimerDisplayMode,
  saveThemeMode,
  saveTimeFormatMode,
  type DisplayMode,
  type MenubarAgentCount,
  type MenubarIconStyle,
  type MenubarLogoColor,
  type ResetTimerDisplayMode,
  type ThemeMode,
  type TimeFormatMode,
} from "@/lib/settings"

type ScheduleTrayIconUpdate = (reason: "probe" | "settings" | "init", delayMs?: number) => void

type UseSettingsDisplayActionsArgs = {
  setThemeMode: (value: ThemeMode) => void
  setDisplayMode: (value: DisplayMode) => void
  resetTimerDisplayMode: ResetTimerDisplayMode
  setResetTimerDisplayMode: (value: ResetTimerDisplayMode) => void
  setTimeFormatMode: (value: TimeFormatMode) => void
  setMenubarIconStyle: (value: MenubarIconStyle) => void
  setMenubarAgentCount: (value: MenubarAgentCount) => void
  setMenubarLogoColor: (value: MenubarLogoColor) => void
  scheduleTrayIconUpdate: ScheduleTrayIconUpdate
}

export function useSettingsDisplayActions({
  setThemeMode,
  setDisplayMode,
  resetTimerDisplayMode,
  setResetTimerDisplayMode,
  setTimeFormatMode,
  setMenubarIconStyle,
  setMenubarAgentCount,
  setMenubarLogoColor,
  scheduleTrayIconUpdate,
}: UseSettingsDisplayActionsArgs) {
  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode)
    void saveThemeMode(mode).catch((error) => {
      console.error("Failed to save theme mode:", error)
    })
  }, [setThemeMode])

  const handleDisplayModeChange = useCallback((mode: DisplayMode) => {
    setDisplayMode(mode)
    scheduleTrayIconUpdate("settings", 0)
    void saveDisplayMode(mode).catch((error) => {
      console.error("Failed to save display mode:", error)
    })
  }, [scheduleTrayIconUpdate, setDisplayMode])

  const handleResetTimerDisplayModeChange = useCallback((mode: ResetTimerDisplayMode) => {
    setResetTimerDisplayMode(mode)
    void saveResetTimerDisplayMode(mode).catch((error) => {
      console.error("Failed to save reset timer display mode:", error)
    })
  }, [setResetTimerDisplayMode])

  const handleResetTimerDisplayModeToggle = useCallback(() => {
    const next = resetTimerDisplayMode === "relative" ? "absolute" : "relative"
    handleResetTimerDisplayModeChange(next)
  }, [handleResetTimerDisplayModeChange, resetTimerDisplayMode])

  const handleTimeFormatModeChange = useCallback((mode: TimeFormatMode) => {
    setTimeFormatMode(mode)
    void saveTimeFormatMode(mode).catch((error) => {
      console.error("Failed to save time format mode:", error)
    })
  }, [setTimeFormatMode])

  const handleMenubarIconStyleChange = useCallback((style: MenubarIconStyle) => {
    setMenubarIconStyle(style)
    scheduleTrayIconUpdate("settings", 0)
    void saveMenubarIconStyle(style).catch((error) => {
      console.error("Failed to save menubar icon style:", error)
    })
  }, [scheduleTrayIconUpdate, setMenubarIconStyle])

  const handleMenubarAgentCountChange = useCallback((count: MenubarAgentCount) => {
    setMenubarAgentCount(count)
    scheduleTrayIconUpdate("settings", 0)
    void saveMenubarAgentCount(count).catch((error) => {
      console.error("Failed to save menubar agent count:", error)
    })
  }, [scheduleTrayIconUpdate, setMenubarAgentCount])

  const handleMenubarLogoColorChange = useCallback((color: MenubarLogoColor) => {
    setMenubarLogoColor(color)
    scheduleTrayIconUpdate("settings", 0)
    void saveMenubarLogoColor(color).catch((error) => {
      console.error("Failed to save menubar logo color:", error)
    })
  }, [scheduleTrayIconUpdate, setMenubarLogoColor])

  return {
    handleThemeModeChange,
    handleDisplayModeChange,
    handleResetTimerDisplayModeChange,
    handleResetTimerDisplayModeToggle,
    handleTimeFormatModeChange,
    handleMenubarIconStyleChange,
    handleMenubarAgentCountChange,
    handleMenubarLogoColorChange,
  }
}
