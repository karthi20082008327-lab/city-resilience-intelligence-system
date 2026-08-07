import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
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
    gray: 'bg-slate-100 text-slate-600 border-slate-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
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
      <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
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
      <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div>
        <h3 className="text-slate-900 font-semibold">{title}</h3>
        {description && <p className="text-slate-500 text-sm mt-1 max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}
