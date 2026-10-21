import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import { useCreateHome } from '../../hooks/use-server-machines'

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
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setDescription('')
      setSubnetCidr('')
      setIsDefault(false)
    }
  }, [open])

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
