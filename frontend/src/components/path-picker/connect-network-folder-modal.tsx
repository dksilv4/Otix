import { useState, useMemo, useEffect } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderSync,
  Home,
  Info,
  Lock,
  Network,
  Plus,
  Server,
  Sparkles,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useConnectServerShare } from '@/features/downloads/use-server-explorer'
import { normalizeShareURLInput } from '@/features/downloads/node-explorer-utils'
import {
  useAssignNodeHome,
  useCreateHome,
  useCreateServerMachine,
  useServerMachines,
  useUserHomes,
} from '@/features/settings/hooks/use-server-machines'

export interface ConnectNetworkFolderModalProps {
  open: boolean
  onClose: () => void
  serverId?: number
  onConnected: (path: string) => void
}

export const ConnectNetworkFolderModal = ({
  open,
  onClose,
  serverId,
  onConnected,
}: ConnectNetworkFolderModalProps) => {
  const { toast } = useToast()

  // Queries
  const { data: servers = [] } = useGameServers()
  const { data: homes = [] } = useUserHomes()
  const { data: serverMachines = [] } = useServerMachines()

  // Active node and its home
  const activeNode = servers.find((s) => s.id === serverId) ?? servers[0]
  const nodeHomeId = activeNode?.homeId
  const activeHome = homes.find((h) => h.id === nodeHomeId)

  // Mutations
  const connectShareMutation = useConnectServerShare(serverId)
  const assignHomeMutation = useAssignNodeHome()
  const createHomeMutation = useCreateHome()
  const createServerMachineMutation = useCreateServerMachine()

  // State: Step 1 (Home setup)
  const [selectedHomeIdToAssign, setSelectedHomeIdToAssign] = useState<string>('')
  const [isCreatingNewHome, setIsCreatingNewHome] = useState(false)
  const [newHomeName, setNewHomeName] = useState('My Home Network')

  // Sync selected home when homes list loads or changes
  useEffect(() => {
    if (homes.length > 0) {
      if (!selectedHomeIdToAssign || !homes.some((h) => String(h.id) === selectedHomeIdToAssign)) {
        setSelectedHomeIdToAssign(String(homes[0].id))
      }
    }
  }, [homes, selectedHomeIdToAssign])

  // State: Step 2 (Machine setup)
  const [isAddingMachine, setIsAddingMachine] = useState(false)
  const [newMachineName, setNewMachineName] = useState('')
  const [newMachineHost, setNewMachineHost] = useState('')
  const [newShareName, setNewShareName] = useState('Games')
  const [newShareUser, setNewShareUser] = useState('')
  const [newSharePass, setNewSharePass] = useState('')

  // State: Step 3 (Share selection & connection)
  const [selectedShareId, setSelectedShareId] = useState<string>('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [workgroup, setWorkgroup] = useState('WORKGROUP')
  const [showPassword, setShowPassword] = useState(false)
  const [showAuthFields, setShowAuthFields] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Machines with Samba in current home (or all machines if unassigned)
  const availableSambaMachines = useMemo(() => {
    return serverMachines.filter(
      (m) =>
        (m.smbEnabled || Boolean(m.smbShareName) || Boolean(m.smbHost)) &&
        (!nodeHomeId || m.homeId === nodeHomeId || !m.homeId),
    )
  }, [serverMachines, nodeHomeId])

  // Automatically select first available share when list loads
  useEffect(() => {
    if (!selectedShareId && availableSambaMachines.length > 0) {
      const first = availableSambaMachines[0]
      const host = first.smbHost || first.host || 'localhost'
      const share = first.smbShareName || 'games'
      setSelectedShareId(String(first.id))
      setUrl(`\\\\${host}\\${share}`)
      setUsername(first.smbUsername || '')
      setPassword(first.smbPassword || '')
      setWorkgroup(first.smbWorkgroup || 'WORKGROUP')
      if (first.smbUsername || first.smbPassword) setShowAuthFields(true)
    }
  }, [availableSambaMachines, selectedShareId])

  const handleShareDropdownChange = (value: string) => {
    setSelectedShareId(value)
    setErrorMessage(null)

    if (value === '__custom__') {
      setUrl('')
      setUsername('')
      setPassword('')
      setShowAuthFields(true)
      return
    }

    const machine = availableSambaMachines.find((m) => String(m.id) === value)
    if (machine) {
      const host = machine.smbHost || machine.host || 'localhost'
      const share = machine.smbShareName || 'games'
      setUrl(`\\\\${host}\\${share}`)
      setUsername(machine.smbUsername || '')
      setPassword(machine.smbPassword || '')
      setWorkgroup(machine.smbWorkgroup || 'WORKGROUP')
      if (machine.smbUsername || machine.smbPassword) setShowAuthFields(true)
    }
  }

  // Step 1: Assign Node to Home
  const handleAssignHome = async (homeId: number) => {
    if (!activeNode?.id) return
    if (!homeId || isNaN(homeId)) {
      toast({
        title: 'Select a Home',
        description: 'Please select a valid Home from the list or create a new one.',
        variant: 'error',
      })
      return
    }
    try {
      await assignHomeMutation.mutateAsync({
        nodeId: activeNode.id,
        homeId,
      })
      toast({
        title: 'Node connected to Home',
        description: `Successfully linked "${activeNode.name}" to Home environment.`,
        variant: 'success',
      })
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.home_id?.[0] ||
        err?.response?.data?.error ||
        err?.message ||
        'Could not update node home assignment.'
      toast({
        title: 'Failed to assign home',
        description: detail,
        variant: 'error',
      })
    }
  }

  // Step 1: Create new Home & assign
  const handleCreateAndAssignHome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHomeName.trim() || !activeNode?.id) return
    try {
      const created = await createHomeMutation.mutateAsync({
        name: newHomeName.trim(),
        description: 'Home environment for local network storage',
        isDefault: homes.length === 0,
      })
      await assignHomeMutation.mutateAsync({
        nodeId: activeNode.id,
        homeId: created.id,
      })
      toast({
        title: 'Home created & assigned',
        description: `Linked node to "${created.name}".`,
        variant: 'success',
      })
      setIsCreatingNewHome(false)
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        'Could not create Home.'
      toast({
        title: 'Failed to create Home',
        description: detail,
        variant: 'error',
      })
    }
  }

  // Step 2: Add machine with Samba share
  const handleAddSambaMachine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMachineName.trim() || !newMachineHost.trim() || !newShareName.trim()) return

    try {
      const host = newMachineHost.trim().replace(/^[\\/]+/, '').replace(/[\\/].*$/, '')
      const share = newShareName.trim().replace(/^[\\/]+/, '')

      const created = await createServerMachineMutation.mutateAsync({
        name: newMachineName.trim(),
        homeId: nodeHomeId || (homes[0]?.id ?? null),
        os: 'other',
        host,
        smbEnabled: true,
        smbHost: host,
        smbPort: 445,
        smbShareName: share,
        smbUsername: newShareUser.trim() || undefined,
        smbPassword: newSharePass || undefined,
        smbWorkgroup: 'WORKGROUP',
        smbNodeIds: activeNode?.id ? [activeNode.id] : [],
        drivesConfig: [],
        isOnline: true,
      })

      toast({
        title: 'Machine & Samba share added',
        description: `Added "${created.name}" (\\\\${host}\\${share}) to Home.`,
        variant: 'success',
      })

      // Select newly added machine share in dropdown
      setSelectedShareId(String(created.id))
      setUrl(`\\\\${host}\\${share}`)
      setUsername(newShareUser.trim())
      setPassword(newSharePass)
      setIsAddingMachine(false)
    } catch (err: any) {
      toast({
        title: 'Failed to add machine',
        description: err.message || 'Could not save server machine.',
        variant: 'error',
      })
    }
  }

  // Step 3: Connect to Share
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUrl = normalizeShareURLInput(url)
    if (!trimmedUrl) return

    setErrorMessage(null)
    try {
      const res = await connectShareMutation.mutateAsync({
        url: trimmedUrl,
        username: username.trim() || undefined,
        password: password || undefined,
        workgroup: workgroup.trim() || undefined,
      })

      toast({
        title: 'Connected to network share',
        description: res.message || `Successfully linked ${res.path}`,
        variant: 'success',
      })

      onConnected(res.path)
      onClose()
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.message ||
        'Could not connect to network share. Check server address and credentials.'
      setErrorMessage(detail)
      toast({
        title: 'Connection failed',
        description: detail,
        variant: 'error',
      })
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      title="Connect to network share"
      description="Connect to shared network storage (NAS, Samba, Windows share) linked through your Home."
      className="max-w-2xl"
    >
      <div className="space-y-4 py-1 text-xs">
        {/* Instruction Guidance Banner */}
        <div className="rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <span>How Network Shares Work in Otix</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            In Otix, network storage is organized by connecting your <strong>Node</strong> to a <strong>Home Environment</strong>, then linking that Home to a <strong>Server Machine</strong> hosting a Samba (SMB) share. Once connected, your node can discover and select those shares directly.
          </p>

          {/* Stepper Status Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
            {/* Step 1 Pill */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl p-2.5 transition-colors border border-white/[0.04]',
                nodeHomeId
                  ? 'bg-primary/10 text-foreground'
                  : 'bg-status-warning/10 text-status-warning font-medium',
              )}
            >
              {nodeHomeId ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <Home className="h-4 w-4 text-status-warning shrink-0" />
              )}
              <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold">Step 1: </span>
                {nodeHomeId ? (
                  <span>Home: {activeHome?.name || 'Assigned'}</span>
                ) : (
                  <span>Connect Node to a Home</span>
                )}
              </div>
            </div>

            {/* Step 2 Pill */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl p-2.5 transition-colors border border-white/[0.04]',
                availableSambaMachines.length > 0
                  ? 'bg-primary/10 text-foreground'
                  : 'bg-status-warning/10 text-status-warning font-medium',
              )}
            >
              {availableSambaMachines.length > 0 ? (
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <Server className="h-4 w-4 text-status-warning shrink-0" />
              )}
              <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold">Step 2: </span>
                {availableSambaMachines.length > 0 ? (
                  <span>{availableSambaMachines.length} Samba Machine(s)</span>
                ) : (
                  <span>Connect a Samba Machine</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* STEP 1 SETUP CARD: Only if Node has no Home */}
        {!nodeHomeId && (
          <div className="rounded-2xl border border-status-warning/20 bg-status-warning/5 p-3.5 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Home className="h-4 w-4 text-status-warning shrink-0" />
              <span>Step 1: Assign this node to a Home</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Node &ldquo;{activeNode?.name}&rdquo; must belong to a Home environment to discover local Samba machines.
            </p>

            {homes.length > 0 && !isCreatingNewHome ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedHomeIdToAssign || String(homes[0]?.id ?? '')}
                  onChange={(e) => setSelectedHomeIdToAssign(e.target.value)}
                  className="h-8 flex-1 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none focus:border-primary"
                >
                  {homes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} {h.isDefault ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                <DkButton
                  size="sm"
                  onClick={() =>
                    handleAssignHome(Number(selectedHomeIdToAssign || homes[0]?.id))
                  }
                  disabled={assignHomeMutation.isPending || homes.length === 0}
                >
                  {assignHomeMutation.isPending ? 'Assigning…' : 'Assign to Home'}
                </DkButton>
                <button
                  type="button"
                  onClick={() => setIsCreatingNewHome(true)}
                  className="text-[11px] text-primary hover:underline cursor-pointer ml-1"
                >
                  + Create New Home
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateAndAssignHome} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  required
                  placeholder="Home Name (e.g. My Home Network)"
                  value={newHomeName}
                  onChange={(e) => setNewHomeName(e.target.value)}
                  className="h-8 flex-1 rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none focus:border-primary"
                />
                <DkButton
                  type="submit"
                  size="sm"
                  disabled={createHomeMutation.isPending || !newHomeName.trim()}
                >
                  Create & Assign Home
                </DkButton>
                {homes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewHome(false)}
                    className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </form>
            )}
          </div>
        )}

        {/* STEP 2 SETUP CARD: When Home is set, but no Samba machines exist */}
        {nodeHomeId && availableSambaMachines.length === 0 && !isAddingMachine && (
          <div className="rounded-2xl border border-status-warning/20 bg-status-warning/5 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Server className="h-4 w-4 text-status-warning shrink-0" />
                <span>Step 2: Add a Machine with a Samba share</span>
              </div>
              <DkButton size="sm" onClick={() => setIsAddingMachine(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Add Samba Machine
              </DkButton>
            </div>
            <p className="text-[11px] text-muted-foreground">
              No server machines with Samba shares were found in &ldquo;{activeHome?.name}&rdquo;. Add your NAS (TrueNAS, Unraid, Synology, Windows PC) so this node can access its shares.
            </p>
          </div>
        )}

        {/* INLINE ADD SAMBA MACHINE FORM */}
        {isAddingMachine && (
          <form
            onSubmit={handleAddSambaMachine}
            className="rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] p-3.5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Server className="h-4 w-4 text-primary shrink-0" />
                <span>Add Machine with Samba Share to {activeHome?.name || 'Home'}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingMachine(false)}
                className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Machine Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TrueNAS, SERVER8"
                  value={newMachineName}
                  onChange={(e) => setNewMachineName(e.target.value)}
                  className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Host / IP Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.50 or SERVER8"
                  value={newMachineHost}
                  onChange={(e) => setNewMachineHost(e.target.value)}
                  className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Share Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Games, storage"
                  value={newShareName}
                  onChange={(e) => setNewShareName(e.target.value)}
                  className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Username (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Leave blank if guest"
                  value={newShareUser}
                  onChange={(e) => setNewShareUser(e.target.value)}
                  className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Password (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Leave blank if guest"
                  value={newSharePass}
                  onChange={(e) => setNewSharePass(e.target.value)}
                  className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <DkButton
                type="submit"
                size="sm"
                disabled={
                  createServerMachineMutation.isPending ||
                  !newMachineName.trim() ||
                  !newMachineHost.trim() ||
                  !newShareName.trim()
                }
              >
                Save Machine & Share
              </DkButton>
            </div>
          </form>
        )}

        {/* STEP 3: SHARE SELECTION DROPDOWN */}
        <form onSubmit={handleConnect} className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Network className="h-3.5 w-3.5 text-primary" />
                <span>Select Samba Share from Dropdown</span>
              </label>
              {nodeHomeId && (
                <button
                  type="button"
                  onClick={() => setIsAddingMachine(true)}
                  className="text-[11px] text-primary hover:underline cursor-pointer"
                >
                  + Add Another Share
                </button>
              )}
            </div>

            <select
              value={selectedShareId}
              onChange={(e) => handleShareDropdownChange(e.target.value)}
              className="h-10 w-full rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-3 text-xs text-foreground outline-none focus:border-primary cursor-pointer font-medium"
            >
              <option value="">-- Choose a Samba share --</option>
              {availableSambaMachines.length > 0 && (
                <optgroup label={`Samba Shares in ${activeHome?.name || 'Home'}`}>
                  {availableSambaMachines.map((m) => {
                    const host = m.smbHost || m.host || 'localhost'
                    const share = m.smbShareName || 'games'
                    return (
                      <option key={m.id} value={String(m.id)}>
                        {m.name} — \\{host}\{share} ({host})
                      </option>
                    )
                  })}
                </optgroup>
              )}
              <optgroup label="Manual Entry">
                <option value="__custom__">Manual / Custom Network Path...</option>
              </optgroup>
            </select>
          </div>

          {/* Share Preview Pod when a machine is selected */}
          {selectedShareId && selectedShareId !== '__custom__' && (
            <div className="rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Resolved Share Details
                </span>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Ready to connect
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-primary shrink-0" />
                <span className="font-mono text-xs font-semibold text-foreground">{url}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                <span>
                  Username: <strong>{username || 'Guest / Unauthenticated'}</strong>
                </span>
                <span>
                  Workgroup: <strong>{workgroup}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Manual Input Fields: Shown when __custom__ is selected or no machine is chosen */}
          {(selectedShareId === '__custom__' || (!selectedShareId && availableSambaMachines.length === 0)) && (
            <div className="space-y-3 rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)] p-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Manual Share Address / UNC Path
                </label>
                <div className="relative flex items-center">
                  <Network className="absolute left-3 h-4 w-4 text-primary" />
                  <input
                    type="text"
                    required
                    placeholder="\\192.168.1.100\games or smb://SERVER8/Games"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      setErrorMessage(null)
                    }}
                    className="h-9 w-full rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] pl-9 pr-3 text-xs text-foreground outline-none focus:border-primary"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/70">
                  Tip: If using hostnames like <code className="font-mono">\SERVER8\Games</code>, use the server&apos;s IP address (e.g. <code className="font-mono">\\192.168.1.50\Games</code>) if NetBIOS resolution fails.
                </p>
              </div>

              {/* Optional Credentials */}
              <div className="pt-1 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowAuthFields(!showAuthFields)}
                  className="flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5 text-primary" />
                  <span>Authentication Credentials (Optional)</span>
                  {showAuthFields ? (
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>

                {showAuthFields && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase">
                        Username
                      </label>
                      <input
                        type="text"
                        placeholder="Leave blank if guest"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 text-xs text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase">
                        Password
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Leave blank if guest"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-8 w-full rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-field)] px-2.5 pr-8 text-xs text-foreground outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Connection Error Feedback with Actionable Assistance */}
          {errorMessage && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 space-y-1.5 text-xs text-destructive">
              <p className="font-semibold">Connection failed</p>
              <p className="text-[11px] opacity-90">{errorMessage}</p>
              {(errorMessage.includes('network name cannot be found') ||
                errorMessage.includes('System error 67') ||
                errorMessage.includes('System error 53')) && (
                <div className="mt-2 rounded-lg bg-[var(--dk-surface-field)] p-2.5 text-[10px] text-foreground/80 space-y-1 border border-white/[0.04]">
                  <p className="font-semibold flex items-center gap-1">
                    <Info className="h-3 w-3 text-primary" />
                    How to fix this:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Try replacing the server name with its local IP address (e.g. <code className="font-mono">\\192.168.1.100\Games</code>).</li>
                    <li>Ensure the server machine is powered on and connected to the same network.</li>
                    <li>Verify that Samba / File Sharing is enabled on the server machine.</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={connectShareMutation.isPending}
            >
              Cancel
            </DkButton>
            <DkButton
              type="submit"
              size="sm"
              disabled={!url.trim() || connectShareMutation.isPending}
              className="gap-1.5"
            >
              {connectShareMutation.isPending ? (
                <>
                  <FolderSync className="h-3.5 w-3.5 animate-spin" />
                  Connecting to Share…
                </>
              ) : (
                <>
                  <Network className="h-3.5 w-3.5" />
                  Connect & Open Share
                </>
              )}
            </DkButton>
          </div>
        </form>
      </div>
    </DkDialog>
  )
}
