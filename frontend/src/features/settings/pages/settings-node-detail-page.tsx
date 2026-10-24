import { useEffect } from 'react'
import { useLocation, useNavigate, useParams } from '@tanstack/react-router'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { useSettingsNode } from '../context/settings-node-context'
import { parseNodeIdParam } from '../node-settings'

export const SettingsNodeDetailPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const params = useParams({ strict: false }) as { nodeId?: string }
  const nodeId = parseNodeIdParam(params.nodeId)
  const { setSelectedNodeId } = useSettingsNode()

  useEffect(() => {
    if (nodeId != null) {
      setSelectedNodeId(nodeId)
    }
    const currentHash = (location?.hash || (typeof window !== 'undefined' ? window.location.hash : '')).replace(/^#/, '').toLowerCase()
    const targetHash = currentHash === 'paths' ? 'paths' : 'organize'
    void navigate({
      to: '/settings/library',
      hash: targetHash,
      replace: true,
    })
  }, [nodeId, location?.hash, navigate, setSelectedNodeId])

  if (!isAuthenticated) {
    return (
      <SettingsLockedState
        title="Sign in required"
        description="Sign in to inspect and configure individual node details."
        icon={ShieldAlert}
        action={<span />}
      />
    )
  }

  return null
}
