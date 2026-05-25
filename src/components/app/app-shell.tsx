import { invoke } from "@tauri-apps/api/core"
import { useShallow } from "zustand/react/shallow"
import { AppContent, type AppContentActionProps } from "@/components/app/app-content"
import { AgentSideNav } from "@/components/app/agent-side-nav"
import { BottomBar } from "@/components/app/bottom-bar"
import { PanelFooter } from "@/components/panel-footer"
import type { NavPlugin, PluginContextAction } from "@/components/side-nav"
import type { DisplayPluginState } from "@/hooks/app/use-app-plugin-views"
import type { SettingsPluginState } from "@/hooks/app/use-settings-plugin-list"
import { useAppVersion } from "@/hooks/app/use-app-version"
import { usePanel } from "@/hooks/app/use-panel"
import { useAppUpdate } from "@/hooks/use-app-update"
import { AgentDashboard } from "@/pages/agent-dashboard"
import { useAppUiStore } from "@/stores/app-ui-store"

type AppShellProps = {
  onRefreshAll: () => void
  navPlugins: NavPlugin[]
  displayPlugins: DisplayPluginState[]
  settingsPlugins: SettingsPluginState[]
  autoUpdateNextAt: number | null
  selectedPlugin: DisplayPluginState | null
  onPluginContextAction: (pluginId: string, action: PluginContextAction) => void
  isPluginRefreshAvailable: (pluginId: string) => boolean
  onNavReorder: (orderedIds: string[]) => void
  appContentProps: AppContentActionProps
}

export function AppShell({
  onRefreshAll,
  navPlugins,
  displayPlugins,
  settingsPlugins,
  autoUpdateNextAt,
  selectedPlugin,
  onPluginContextAction: _onPluginContextAction,
  isPluginRefreshAvailable: _isPluginRefreshAvailable,
  onNavReorder: _onNavReorder,
  appContentProps,
}: AppShellProps) {
  const {
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
  } = useAppUiStore(
    useShallow((state) => ({
      activeView: state.activeView,
      setActiveView: state.setActiveView,
      showAbout: state.showAbout,
      setShowAbout: state.setShowAbout,
    }))
  )

  const {
    containerRef,
    scrollRef,
    canScrollDown,
  } = usePanel({
    activeView,
    setActiveView,
    showAbout,
    setShowAbout,
    displayPlugins,
  })

  const appVersion = useAppVersion()
  const { updateStatus, triggerInstall, checkForUpdates } = useAppUpdate()
  const quitApp = () => invoke("quit_app").catch(console.error)

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="flex h-screen flex-col bg-[#0a0b14] outline-none"
    >
      {/* Main content area */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#0a0b14]">
        {activeView === "home" ? (
          <AgentDashboard
            plugins={displayPlugins}
            scrollRef={scrollRef}
            onRefreshAll={onRefreshAll}
            onOpenPlugin={setActiveView}
          />
        ) : (
          <>
            {/* Left vertical agent/settings sidebar */}
            <AgentSideNav
              activeView={activeView}
              navPlugins={navPlugins}
              onViewChange={setActiveView}
            />
            {/* Scrollable content */}
            <div
              className="relative min-h-0 flex-1 overflow-y-auto scrollbar-none px-4 py-4"
              ref={scrollRef}
            >
              <AppContent
                {...appContentProps}
                displayPlugins={displayPlugins}
                settingsPlugins={settingsPlugins}
                selectedPlugin={selectedPlugin}
              />
              <div
                className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0a0b14] to-transparent transition-opacity duration-200 ${canScrollDown ? "opacity-100" : "opacity-0"}`}
              />
            </div>
          </>
        )}
      </div>

      {/* Version/update footer — only on non-home pages */}
      {activeView !== "home" && (
        <div className="shrink-0 border-t border-white/[0.05] px-4 py-1">
          <PanelFooter
            version={appVersion}
            autoUpdateNextAt={autoUpdateNextAt}
            updateStatus={updateStatus}
            onUpdateInstall={triggerInstall}
            onUpdateCheck={checkForUpdates}
            onRefreshAll={onRefreshAll}
          />
        </div>
      )}

      {/* Global bottom navigation bar */}
      <BottomBar
        activeView={activeView}
        onViewChange={setActiveView}
        onQuitApp={quitApp}
      />
    </div>
  )
}
