// TODO: Review this file
import { cn } from '@/lib/utils'
import './workout-input.scss'

interface WorkoutInputProps {
 value: string
 onChange: (value: string) => void
 isLoading: boolean
}

export function WorkoutInput({ value, onChange, isLoading }: WorkoutInputProps) {
 return (
 <textarea
 className={cn(
 'dk-workout__input',
 isLoading && 'dk-workout__input--disabled',
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
