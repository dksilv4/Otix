import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { xpListeners, type XPToast } from './xp-toast-dispatcher'

export function XPToastContainer({ className }: { className?: string }) {
  const [toasts, setToasts] = useState<XPToast[]>([])

  useEffect(() => {
    xpListeners.add(setToasts)
    return () => {
      xpListeners.delete(setToasts)
    }
  }, [])

  return (
    <div className={cn('pointer-events-none fixed inset-0 z-[99999]', className)}>
      {toasts.map((t) => (
        <XPToastItem
          key={t.id}
          amount={t.amount}
          onDone={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>
  )
}

function XPToastItem({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 1200)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className="absolute left-1/2 top-1/3 -translate-x-1/2 animate-xp-float">
      <span className="whitespace-nowrap text-lg font-extrabold tracking-tight text-primary drop-shadow-[0_0_8px_var(--primary)]">
        +{amount} XP
      </span>
    </div>
  )
}
