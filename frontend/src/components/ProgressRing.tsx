interface Props {
  percent:   number
  size?:     number
  stroke?:   number
  color?:    string
  label?:    string
  sublabel?: string
}

export function ProgressRing({
  percent,
  size    = 120,
  stroke  = 8,
  color   = '#6C63FF',
  label,
  sublabel,
}: Props) {
  const r          = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset     = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#22222E"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-text-primary font-display">
          {Math.round(percent)}%
        </span>
        {label    && <span className="text-xs text-text-muted">{label}</span>}
        {sublabel && <span className="text-xs text-text-muted">{sublabel}</span>}
      </div>
    </div>
  )
}
