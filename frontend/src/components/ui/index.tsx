import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-white/[0.06] bg-[rgba(10,15,26,0.6)] backdrop-blur-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

export function Badge({
  children,
  color = 'gray',
  className,
}: {
  children: ReactNode
  color?: 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple'
  className?: string
}) {
  const colors: Record<string, string> = {
    gray: 'bg-white/[0.06] text-white/60 border-white/[0.08]',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border',
        colors[color],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}

export function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div>
        <h3 className="text-white font-semibold">{title}</h3>
        {description && <p className="text-gray-400 text-sm mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}
