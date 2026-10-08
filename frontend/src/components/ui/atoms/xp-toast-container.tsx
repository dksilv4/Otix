import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { xpListeners, type XPToast } from './xp-toast-dispatcher'

export const XPToastContainer = ({ className }: { className?: string }) => {
  const [toasts, setToasts] = useState<XPToast[]>([])

  useEffect(() => {
    xpListeners.add(setToasts)
    return () => {
      xpListeners.delete(setToasts)
    }
  }, [])

  return (
    <div className={cn('pointer-events-none fixed inset-0 z-[99999]', className)}>
      {toasts.map((t) =>
        t.isLevelUp ? (
          <LevelUpToastItem
            key={t.id}
            level={t.level ?? 1}
            title={t.levelTitle ?? 'Novice'}
            onDone={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          />
        ) : (
          <XPToastItem
            key={t.id}
            amount={t.amount}
            reason={t.reason}
            onDone={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          />
        ),
      )}
    </div>
  )
};

const XPToastItem = ({
  amount,
  reason,
  onDone,
}: {
  amount: number
  reason?: string
  onDone: () => void
}) => {
  useEffect(() => {
    const timer = setTimeout(onDone, reason ? 1800 : 1200)
    return () => clearTimeout(timer)
  }, [onDone, reason])

  return (
    <div className="absolute left-1/2 top-1/3 -translate-x-1/2 animate-xp-float flex flex-col items-center gap-1.5">
      <span className="whitespace-nowrap text-lg font-extrabold tracking-tight text-primary drop-shadow-[0_0_8px_var(--primary)]">
        +{amount} XP
      </span>
      {reason && (
        <span className="whitespace-nowrap px-2.5 py-0.5 rounded-lg bg-[var(--dk-surface-ghost)] backdrop-blur-xl text-[11px] font-semibold text-foreground/85 shadow-sm">
          {reason}
        </span>
      )}
    </div>
  )
};

const LevelUpToastItem = ({
  level,
  title,
  onDone,
}: {
  level: number
  title: string
  onDone: () => void
}) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="absolute left-1/2 top-1/4 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col items-center gap-1.5 px-6 py-4 rounded-2xl bg-card border border-primary/40 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5 animate-pulse" />
          <span className="text-xs uppercase tracking-widest font-black">Level Up!</span>
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div className="text-2xl font-black tracking-tight text-foreground">
          Level {level}
        </div>
        <div className="text-sm font-semibold text-primary">
          {title}
        </div>
      </div>
    </div>
  )
};
