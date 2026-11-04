import { Cpu, Server, HardDrive, Gamepad2, Radio, Laptop } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { UnifiedInfrastructureItem } from '../../utils/node-views'

export interface NodeItemTypeIconProps {
  type: UnifiedInfrastructureItem['type']
  isApp?: boolean
  size?: number
  className?: string
}

export const NodeItemTypeIcon = ({
  type,
  isApp = false,
  size = 16,
  className,
}: NodeItemTypeIconProps) => {
  if (type === 'unclaimed_node') {
    return <Radio size={size} className={cn('text-primary', className)} />
  }

  if (type === 'node') {
    if (isApp) {
      return <Laptop size={size} className={cn('text-primary', className)} />
    }
    return <Cpu size={size} className={cn('text-primary', className)} />
  }

  if (type === 'server') {
    return <Server size={size} className={cn('text-primary', className)} />
  }

  if (type === 'samba') {
    return <HardDrive size={size} className={cn('text-primary', className)} />
  }

  return <Gamepad2 size={size} className={cn('text-primary', className)} />
}
