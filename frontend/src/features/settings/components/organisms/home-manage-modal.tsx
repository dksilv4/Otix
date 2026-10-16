import { useState, useEffect } from 'react'
import { Home as HomeIcon, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import type { UserHome } from '../../types/server-machines'
import { useCreateHome, useUpdateHome } from '../../hooks/use-server-machines'

interface HomeManageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  home?: UserHome | null
  onSuccess?: () => void
}

export const HomeManageModal = ({
  open,
  onOpenChange,
  home,
  onSuccess,
}: HomeManageModalProps) => {
  const { toast } = useToast()
  const createMutation = useCreateHome()
  const updateMutation = useUpdateHome()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subnetCidr, setSubnetCidr] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (home) {
      setName(home.name)
      setDescription(home.description || '')
      setSubnetCidr(home.subnetCidr || '')
      setIsDefault(home.isDefault)
    } else {
      setName('')
      setDescription('')
      setSubnetCidr('')
      setIsDefault(false)
    }
  }, [home, open])

  const isSaving = createMutation.isPending || updateMutation.isPending

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please specify a name for this Home.',
        variant: 'error',
      })
      return
    }

    try {
      if (home) {
        await updateMutation.mutateAsync({
          id: home.id,
          name: name.trim(),
          description: description.trim(),
          subnetCidr: subnetCidr.trim(),
          isDefault,
        })
        toast({
          title: 'Home Updated',
          description: `Updated “${name.trim()}”.`,
          variant: 'success',
        })
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          subnetCidr: subnetCidr.trim(),
          isDefault,
        })
        toast({
          title: 'Home Created',
          description: `Created “${name.trim()}”.`,
          variant: 'success',
        })
      }
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
        title: 'Error saving Home',
        description: serverMsg || axiosErr.message || 'Failed to save Home.',
        variant: 'destructive',
      })
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-md"
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HomeIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight text-white">
              {home ? `Edit ${home.name}` : 'New Home Location'}
            </h2>
            <p className="text-xs text-white/50">
              Group nodes, server machines, and instances by household or environment.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-3">
        <div>
          <label className="block text-xs font-medium text-white/70 mb-1.5">
            Home Name *
          </label>
          <DkInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Residence, Homelab, Cabin"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-white/70 mb-1.5">
            Description (Optional)
          </label>
          <DkInput
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Primary home local network"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-white/70 mb-1.5">
            Subnet CIDR (Optional)
          </label>
          <DkInput
            value={subnetCidr}
            onChange={(e) => setSubnetCidr(e.target.value)}
            placeholder="e.g. 192.168.1.0/24"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
          <div>
            <p className="text-xs font-medium text-white/90">Default Home</p>
            <p className="text-[10px] text-white/40">New nodes and servers will automatically assign here.</p>
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
            {home ? 'Save Changes' : 'Create Home'}
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
};
