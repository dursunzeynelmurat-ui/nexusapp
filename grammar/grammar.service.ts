import nspell from 'nspell'
import { logger } from '../utils/logger'

export interface GrammarError {
  word:        string
  offset:      number
  length:      number
  suggestions: string[]
}

export interface StyleIssue {
  type:    string
  message: string
  offset?: number
}

export interface GrammarResult {
  errors:      GrammarError[]
  styleIssues: StyleIssue[]
}

// Lazy-loaded English spellchecker
let _englishSpell: ReturnType<typeof nspell> | null = null
async function getEnglishSpell() {
  if (_englishSpell) return _englishSpell
  try {
    const dictModule = await import('dictionary-en')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load: (cb: (err: any, dict: { aff: Buffer; dic: Buffer }) => void) => void =
      dictModule.default ?? dictModule
    await new Promise<void>((resolve, reject) => {
      load((err, dict) => {
        if (err) { reject(err); return }
        _englishSpell = nspell(dict)
        resolve()
      })
    })
  } catch {
    logger.warn('Could not load English dictionary, falling back to empty spell checker')
    _englishSpell = nspell({ aff: 'SET UTF-8\n', dic: '0\n' })
  }
  return _englishSpell
}

// ── Turkish rule-based checker ──────────────────────────────────────────────

// Common Turkish character substitution mistakes (ASCII vs Turkish)
const TR_CHAR_RULES: [RegExp, string][] = [
  [/\bii\b/g, 'ı'],
  [/[sS][Ss]/g, 'Şş'],
]

// Common Turkish typos: [wrong, correct]
const TR_COMMON_TYPOS: [string, string][] = [
  ['degil', 'değil'],
  ['degıl', 'değil'],
  ['sekerli', 'şekerli'],
  ['supheli', 'şüpheli'],
  ['gercek', 'gerçek'],
  ['kucuk', 'küçük'],
  ['buyuk', 'büyük'],
  ['ozel', 'özel'],
  ['dunye', 'dünya'],
  ['evet evet', 'evet'],
  ['tamam tamam', 'tamam'],
  ['acele acele', 'acele'],
]

function checkTurkish(text: string): GrammarResult {
  const errors:      GrammarError[] = []
  const styleIssues: StyleIssue[]   = []

  for (const [wrong, correct] of TR_COMMON_TYPOS) {
    let idx = 0
    const lower = text.toLowerCase()
    while ((idx = lower.indexOf(wrong, idx)) !== -1) {
      errors.push({
        word:        text.slice(idx, idx + wrong.length),
        offset:      idx,
        length:      wrong.length,
        suggestions: [correct],
      })
      idx += wrong.length
    }
  }

  // Style: double spaces
  if (/  +/.test(text)) {
    styleIssues.push({ type: 'double_space', message: 'Çift boşluk var' })
  }

  // Style: sentence doesn't start with capital
  if (text.length > 0 && text[0] !== text[0].toUpperCase()) {
    styleIssues.push({ type: 'capitalization', message: 'Cümle büyük harfle başlamalı' })
  }

  return { errors, styleIssues }
}

// ── Arabic rule-based checker ────────────────────────────────────────────────

const AR_HAMZA_RULES: [RegExp, string][] = [
  [/إ(?=\s)/g, 'إ word-final hamza'],
  [/أ(?=ل)/g,  'أ before ال'],
]

// Common Arabic style issues
function checkArabic(text: string): GrammarResult {
  const errors:      GrammarError[] = []
  const styleIssues: StyleIssue[]   = []

  // Check for missing tatweel (kashida) used incorrectly
  if (/ـ{3,}/.test(text)) {
    styleIssues.push({ type: 'excessive_tatweel', message: 'استخدام مفرط للتطويل (كشيدة)' })
  }

  // Check for mixed direction text
  if (/[a-zA-Z]/.test(text) && /[\u0600-\u06FF]/.test(text)) {
    styleIssues.push({ type: 'mixed_direction', message: 'النص يحتوي على حروف عربية وإنجليزية معاً' })
  }

  // Double Arabic punctuation
  if (/[،؟!]{2,}/.test(text)) {
    styleIssues.push({ type: 'double_punctuation', message: 'علامات ترقيم متكررة' })
  }

  return { errors, styleIssues }
}

// ── English spellchecker ─────────────────────────────────────────────────────

async function checkEnglish(text: string): Promise<GrammarResult> {
  const spell       = await getEnglishSpell()
  const errors:      GrammarError[] = []
  const styleIssues: StyleIssue[]   = []

  // Tokenize words (preserving offsets)
  const wordRegex = /\b[a-zA-Z']+\b/g
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0]
    if (word.length < 2) continue

    if (!spell.correct(word)) {
      errors.push({
        word,
        offset:      match.index,
        length:      word.length,
        suggestions: spell.suggest(word).slice(0, 5),
      })
    }
  }

  // Style: double spaces
  if (/  +/.test(text)) {
    styleIssues.push({ type: 'double_space', message: 'Double space detected' })
  }

  // Style: sentence capitalization
  const sentences = text.split(/[.!?]+\s+/)
  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (trimmed.length > 0 && /^[a-z]/.test(trimmed)) {
      styleIssues.push({ type: 'capitalization', message: 'Sentence should start with a capital letter' })
      break
    }
  }

  // Repeated words
  const repeatedWord = text.match(/\b(\w+)\s+\1\b/i)
  if (repeatedWord) {
    styleIssues.push({ type: 'repeated_word', message: `Repeated word: "${repeatedWord[1]}"` })
  }

  return { errors, styleIssues }
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function checkGrammar(text: string, lang: string): Promise<GrammarResult> {
  switch (lang) {
    case 'en': return checkEnglish(text)
    case 'tr': return checkTurkish(text)
    case 'ar': return checkArabic(text)
    default:   return checkEnglish(text)
  }
}
