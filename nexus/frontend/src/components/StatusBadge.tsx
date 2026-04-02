import clsx from 'clsx'

type Variant = 'connected' | 'disconnected' | 'connecting' | 'qr_ready' |
               'draft' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' |
               'active' | 'inactive' | 'success' | 'warning' | 'error'

const variantStyles: Record<Variant, string> = {
  connected:    'bg-green-500/20  text-green-400  border-green-500/30',
  disconnected: 'bg-gray-500/20   text-gray-400   border-gray-500/30',
  connecting:   'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  qr_ready:     'bg-blue-500/20   text-blue-400   border-blue-500/30',
  draft:        'bg-gray-500/20   text-gray-400   border-gray-500/30',
  queued:       'bg-blue-500/20   text-blue-400   border-blue-500/30',
  running:      'bg-accent/20     text-accent      border-accent/30',
  paused:       'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  completed:    'bg-green-500/20  text-green-400  border-green-500/30',
  failed:       'bg-red-500/20    text-red-400    border-red-500/30',
  active:       'bg-green-500/20  text-green-400  border-green-500/30',
  inactive:     'bg-gray-500/20   text-gray-400   border-gray-500/30',
  success:      'bg-green-500/20  text-green-400  border-green-500/30',
  warning:      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  error:        'bg-red-500/20    text-red-400    border-red-500/30',
}

const dots: Partial<Record<Variant, boolean>> = {
  connected: true,
  running:   true,
  connecting: true,
}

interface Props {
  variant: Variant | string
  label:   string
  size?:   'sm' | 'md'
}

export function StatusBadge({ variant, label, size = 'sm' }: Props) {
  const styles = variantStyles[variant as Variant] ?? variantStyles.inactive
  const hasDot = dots[variant as Variant]

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        styles
      )}
    >
      {hasDot && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  )
}
