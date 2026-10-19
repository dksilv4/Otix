import { formatTimeAgo } from '@/lib/utils'

interface NotificationTimeProps {
  createdAt: string
}

export const NotificationTime = ({ createdAt }: NotificationTimeProps) => {
  return (
    <time className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
      {formatTimeAgo(createdAt)}
    </time>
  )
};
