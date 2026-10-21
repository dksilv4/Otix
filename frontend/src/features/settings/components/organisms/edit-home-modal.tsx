import { useState, useEffect } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import type { UserHome } from '../../types/server-machines'
import { useUpdateHome, useDeleteHome } from '../../hooks/use-server-machines'

export interface EditHomeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  home: UserHome | null
  onSuccess?: () => void
  onDelete?: (home: UserHome) => void
}

export const EditHomeModal = ({
  open,
  onOpenChange,
  home,
  onSuccess,
  onDelete,
}: EditHomeModalProps) => {
  const { toast } = useToast()
  const updateMutation = useUpdateHome()
  const deleteMutation = useDeleteHome()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [subnetCidr, setSubnetCidr] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (home) {
      setName(home.name)
      setDescription(home.description || '')
      setSubnetCidr(home.subnetCidr || '')
      setIsDefault(home.isDefault)
    }
  }, [home, open])

  if (!home) return null

  const isSaving = updateMutation.isPending || deleteMutation.isPending

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
        title: 'Error saving Home',
        description: serverMsg || axiosErr.message || 'Failed to save Home.',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    try {
      if (onDelete) {
        onDelete(home)
      } else {
        await deleteMutation.mutateAsync(home.id)
        toast({
          title: 'Home Deleted',
          description: `Deleted ${home.name}.`,
          variant: 'default',
        })
      }
      setConfirmDelete(false)
      onOpenChange(false)
      onSuccess?.()
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: (err as { message?: string })?.message || 'Failed to delete home.',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <DkDialog
        open={open}
        onOpenChange={onOpenChange}
        className="max-w-md"
        title={`Edit ${home.name}`}
        description="Update network IP subnet and settings for this physical location."
      >
        <div className="space-y-4 pt-3">
          {/* Status Light Bar */}
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary animate-pulse" />
              <p className="text-xs font-semibold text-foreground truncate">
                Home Environment Active
                {isDefault && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                    Default Network
                  </span>
                )}
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {subnetCidr || 'Local Network'}
            </span>
          </div>

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

          <div className="flex items-center justify-between pt-2">
            {!home.isDefault ? (
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={isSaving}
                className="text-destructive hover:bg-destructive/10 text-xs gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Home
              </DkButton>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
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
                Save Changes
              </DkButton>
            </div>
          </div>
        </div>
      </DkDialog>

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <DkDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete Home Location"
          description={`Are you sure you want to delete "${home.name}"?`}
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will remove the home location. Any associated nodes and servers will be unassigned
              from this location.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isSaving}
                className="gap-1.5"
              >
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete Home
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}
    </>
  )
}
