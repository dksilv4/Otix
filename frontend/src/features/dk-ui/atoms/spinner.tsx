// TODO: Review this file
import { cn } from '@/lib/utils'
import './spinner.scss'

function DkSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('dk-spinner', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="dk-spinner__track"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="dk-spinner__arc"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export { DkSpinner }
