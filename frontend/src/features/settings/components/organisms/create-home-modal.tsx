import { useState, useEffect } from 'react'
import { Loader2, Wifi, ShieldCheck } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import { useCreateHome } from '../../hooks/use-server-machines'
import { detectDesktopCurrentNetwork } from '../../utils/server-machines'

export interface CreateHomeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export const CreateHomeModal = ({
  open,
  onOpenChange,
  onSuccess,
}: CreateHomeModalProps) => {
  const { toast } = useToast()
  const createMutation = useCreateHome()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subnetCidr, setSubnetCidr] = useState('')
  const [wifiSsid, setWifiSsid] = useState('')
  const [gatewayMac, setGatewayMac] = useState('')
  const [bssid, setBssid] = useState('')
  const [localServerUrl, setLocalServerUrl] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setSubnetCidr('')
      setWifiSsid('')
      setGatewayMac('')
      setBssid('')
      setLocalServerUrl('')
      setIsDefault(false)
    }
  }, [open])

  const handleDetectNetwork = async () => {
    setIsDetecting(true)
    try {
      const net = await detectDesktopCurrentNetwork()
      if (!net) {
        toast({
          title: 'Auto-detection Unavailable',
          description: 'Network detection is only available inside the Otix Desktop app.',
          variant: 'destructive',
        })
        return
      }

      if (net.ssid) setWifiSsid(net.ssid)
      if (net.gatewayMac) setGatewayMac(net.gatewayMac)
      if (net.bssid) setBssid(net.bssid)
      if (net.gatewayIp && !subnetCidr) {
        const parts = net.gatewayIp.split('.')
        if (parts.length === 4) {
          setSubnetCidr(`${parts[0]}.${parts[1]}.${parts[2]}.0/24`)
        }
      }

      toast({
        title: 'Current Network Captured',
        description: `Captured Wi-Fi ${net.ssid || 'Network'} and Router MAC ${net.gatewayMac || ''}.`,
        variant: 'default',
      })
    } catch {
      toast({
        title: 'Detection Failed',
        description: 'Failed to inspect current network adapter.',
        variant: 'destructive',
      })
    } finally {
      setIsDetecting(false)
    }
  }

  const isSaving = createMutation.isPending

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please specify a name for this Home.',
        variant: 'destructive',
      })
      return
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        subnetCidr: subnetCidr.trim(),
        wifiSsid: wifiSsid.trim(),
        gatewayMac: gatewayMac.trim(),
        bssid: bssid.trim(),
        localServerUrl: localServerUrl.trim(),
        isDefault,
      })
      toast({
        title: 'Home Created',
        description: `Created “${name.trim()}”.`,
        variant: 'default',
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { detail?: string; error?: string; [key: string]: unknown } }
        message?: string
      }
      const data = axiosErr.response?.data
      let serverMsg: string | undefined
      if (typeof data === 'string') {
        serverMsg = data
      } else if (data && typeof data === 'object') {
        serverMsg =
          data.detail ||
          data.error ||
          Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('; ')
      }
      toast({
        title: 'Error creating Home',
        description: serverMsg || axiosErr.message || 'Failed to create Home.',
        variant: 'destructive',
      })
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-md"
      title="New Home Location"
      description="Group nodes, server machines, and instances by household or environment."
    >
      <div className="space-y-4 pt-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Home Name *
          </label>
          <DkInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Residence, Homelab, Cabin"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Description (Optional)
          </label>
          <DkInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Primary home local network"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Subnet CIDR (Optional)
          </label>
          <DkInput
            value={subnetCidr}
            onChange={(e) => setSubnetCidr(e.target.value)}
            placeholder="e.g. 192.168.1.0/24"
          />
        </div>

        {/* Home Network Profile (Hardware Verification) */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.04] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Network Hardware Profile
              </p>
              <p className="text-[11px] text-muted-foreground">
                Prevents duplicate-SSID foreign networks from impersonating your home.
              </p>
            </div>
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDetectNetwork}
              disabled={isDetecting}
              className="text-[11px] h-7 px-2.5 gap-1 shrink-0"
            >
              {isDetecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Wifi className="h-3 w-3" />
              )}
              Detect Current
            </DkButton>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Home Wi-Fi (SSID)
              </label>
              <DkInput
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                placeholder="e.g. Home_5GHz"
                className="text-xs h-8"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Router MAC (Hardware)
              </label>
              <DkInput
                value={gatewayMac}
                onChange={(e) => setGatewayMac(e.target.value)}
                placeholder="e.g. aa:bb:cc:dd:ee:ff"
                className="text-xs h-8 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">
              Local Server URL (Challenge Ping)
            </label>
            <DkInput
              value={localServerUrl}
              onChange={(e) => setLocalServerUrl(e.target.value)}
              placeholder="e.g. http://192.168.1.100:8090"
              className="text-xs h-8 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
          <div>
            <p className="text-xs font-medium text-foreground">Default Home</p>
            <p className="text-[10px] text-muted-foreground">New nodes and servers will automatically assign here.</p>
          </div>
          <DkSwitch checked={isDefault} onCheckedChange={setIsDefault} />
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <DkButton
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Home
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
