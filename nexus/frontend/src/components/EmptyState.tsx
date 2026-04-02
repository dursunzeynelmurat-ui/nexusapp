import type { ReactNode } from 'react'

interface Props {
  icon?:        ReactNode
  title:        string
  description?: string
  action?:      ReactNode
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-card text-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-text-primary font-display">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-text-muted">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
