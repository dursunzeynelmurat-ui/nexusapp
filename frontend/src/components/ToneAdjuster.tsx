import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

type Tone = 'formal' | 'casual' | 'friendly'

interface Props {
  value:    Tone
  onChange: (tone: Tone) => void
  onApply:  (text: string, tone: Tone) => void
  text:     string
}

const tones: { value: Tone; label: string; emoji: string }[] = [
  { value: 'formal',   label: 'Formal',   emoji: '🎩' },
  { value: 'casual',   label: 'Casual',   emoji: '👋' },
  { value: 'friendly', label: 'Friendly', emoji: '😊' },
]

function applyToneTransformation(text: string, tone: Tone): string {
  switch (tone) {
    case 'formal':
      return text
        .replace(/\bhi\b/gi, 'Dear')
        .replace(/\bhey\b/gi, 'Good day')
        .replace(/\byou're\b/gi, 'you are')
        .replace(/\bi'm\b/gi, 'I am')
        .replace(/\bwe're\b/gi, 'we are')
        .replace(/\bcan't\b/gi, 'cannot')
        .replace(/\bwon't\b/gi, 'will not')
        .replace(/\bdon't\b/gi, 'do not')
        .replace(/!/g, '.')

    case 'casual':
      return text
        .replace(/\bDear\b/g, 'Hey')
        .replace(/\bGood day\b/gi, 'Hi')
        .replace(/\byou are\b/g, "you're")
        .replace(/\bI am\b/g, "I'm")
        .replace(/\bcannot\b/g, "can't")
        .replace(/\bwill not\b/g, "won't")

    case 'friendly':
      return text
        .replace(/\bDear\b/g, 'Hi there')
        .replace(/\bGood day\b/gi, 'Hello!')
        .replace(/\.$/, '! 😊')

    default:
      return text
  }
}

export function ToneAdjuster({ value, onChange, onApply, text }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h4 className="text-sm font-medium text-text-primary">Tone Adjuster</h4>

      <div className="flex gap-2">
        {tones.map((tone) => (
          <button
            key={tone.value}
            onClick={() => onChange(tone.value)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
              value === tone.value
                ? 'bg-accent text-white'
                : 'bg-secondary text-text-muted hover:bg-card hover:text-text-primary'
            )}
          >
            <span>{tone.emoji}</span>
            <span>{tone.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => onApply(applyToneTransformation(text, value), value)}
        disabled={!text.trim()}
        className="w-full rounded-lg py-2 text-xs font-medium bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
      >
        Apply {tones.find((t) => t.value === value)?.label} Tone
      </button>
    </div>
  )
}
