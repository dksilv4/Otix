import { cn } from '@/lib/utils'

interface WorkoutInputProps {
 value: string
 onChange: (value: string) => void
 isLoading: boolean
}

export function WorkoutInput({ value, onChange, isLoading }: WorkoutInputProps) {
 return (
 <textarea
 className={cn(
 'w-full min-h-[90px] rounded-2xl bg-[var(--dk-surface-field)] px-4 py-3',
 'text-sm placeholder:text-muted-foreground/50',
 'focus-visible:outline-none focus-visible:border-[var(--dk-border-accent)] focus-visible:ring-1 focus-visible:ring-[var(--dk-border-accent)]',
 'resize-y transition-colors',
 'disabled:cursor-not-allowed disabled:opacity-50',
 )}
 placeholder="3x12 bench press at 80kg, 5x5 squat 100kg"
 value={value}
 onChange={(e) => onChange(e.target.value)}
 disabled={isLoading}
 maxLength={1000}
 autoFocus
 />
 )
}
