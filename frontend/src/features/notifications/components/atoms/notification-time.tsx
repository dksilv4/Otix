import { formatTimeAgo } from '@/lib/utils'

interface NotificationTimeProps {
  createdAt: string
}

export const NotificationTime = ({ createdAt }: NotificationTimeProps) => {
  return (
    <time className="text-[10px] text-white/30 shrink-0 tabular-nums">
      {formatTimeAgo(createdAt)}
    </time>
  )
};
