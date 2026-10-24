import { useOrganizeSettings } from '../../hooks/use-organize-settings'
import { OrganizeNamingCard } from './organize-naming-card'
import { OrganizeAutomationCard } from './organize-automation-card'
import { CopyImportNodeSettingsCard } from './copy-import-node-settings-card'
import { OrganizeTestRunModal } from './organize-test-run-modal'

export interface SettingsOrganizeSectionProps {
  nodeId?: number | null
}

export const SettingsOrganizeSection = ({ nodeId: nodeIdProp }: SettingsOrganizeSectionProps = {}) => {
  const {
    // State
    autoSearch,
    intervalHours,
    autoOrganizeEnabled,
    postProcessEnabled,
    isoDownloadPath,
    scanOnLaunch,
    testRunOpen,
    selectedDirectory,
    customRulesCount,
    availableScanPaths,

    // Setters
    setAutoSearch,
    setIntervalHours,
    setAutoOrganizeEnabled,
    setPostProcessEnabled,
    setIsoDownloadPath,
    setScanOnLaunch,
    setTestRunOpen,
    setSelectedDirectory,

    // Computed
    activeTemplate,
    activePresetId,
    isCustomRuleActive,
    liveSamplePreview,
    directoryDropdownOptions,

    // Handlers
    handleUpdateTemplate,
    handleResetDirectoryToDefault,
    handleInsertToken,
    refreshSettings,

    // Refs
    templateInputRef,

    // Context & IDs
    remoteNodeId,
    nodeId,
    servers,
    dlConfig,
    saveConfig,
  } = useOrganizeSettings({ nodeId: nodeIdProp })

  return (
    <div id="organize" className="space-y-4 scroll-mt-28">
      {/* 1. Primary Naming & Folder Structure Card */}
      <OrganizeNamingCard
        activeTemplate={activeTemplate}
        activePresetId={activePresetId}
        isCustomRuleActive={isCustomRuleActive}
        liveSamplePreview={liveSamplePreview}
        selectedDirectory={selectedDirectory}
        directoryDropdownOptions={directoryDropdownOptions}
        customRulesCount={customRulesCount}
        isoDownloadPath={isoDownloadPath}
        autoOrganizeEnabled={autoOrganizeEnabled}
        nodeId={nodeId}
        templateInputRef={templateInputRef}
        onSelectDirectory={setSelectedDirectory}
        onResetDirectoryToDefault={handleResetDirectoryToDefault}
        onUpdateTemplate={handleUpdateTemplate}
        onInsertToken={handleInsertToken}
        onSetIsoDownloadPath={setIsoDownloadPath}
        onSetAutoOrganizeEnabled={setAutoOrganizeEnabled}
        onOpenTestRun={() => setTestRunOpen(true)}
      />

      {/* 2. Automation Card */}
      <OrganizeAutomationCard
        autoSearch={autoSearch}
        intervalHours={intervalHours}
        postProcessEnabled={postProcessEnabled}
        scanOnLaunch={scanOnLaunch}
        onSetAutoSearch={setAutoSearch}
        onSetIntervalHours={setIntervalHours}
        onSetPostProcessEnabled={setPostProcessEnabled}
        onSetScanOnLaunch={setScanOnLaunch}
      />

      {/* 3. Copy & Import Settings from Another Node */}
      <CopyImportNodeSettingsCard
        currentNodeId={nodeId ?? 0}
        servers={servers}
        dlConfig={dlConfig}
        saveConfig={saveConfig}
        onSettingsImported={refreshSettings}
      />

      {/* Test Run Dry-Run Modal */}
      {testRunOpen && (
        <OrganizeTestRunModal
          open={testRunOpen}
          onOpenChange={setTestRunOpen}
          nodeId={remoteNodeId}
          template={activeTemplate}
          isoDirectory={
            selectedDirectory !== 'all'
              ? selectedDirectory
              : isoDownloadPath || availableScanPaths[0]?.path || ''
          }
          availableScanPaths={availableScanPaths}
        />
      )}
    </div>
  )
}
