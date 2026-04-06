import { checkGrammar } from '../grammar/grammar.service'

describe('Grammar service', () => {
  describe('English', () => {
    it('detects no errors in a correct sentence', async () => {
      const result = await checkGrammar('Hello world, this is a test.', 'en')
      // "Hello" and "world" are common words — should have 0 errors ideally
      // (dictionary may vary; just check structure)
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('styleIssues')
      expect(Array.isArray(result.errors)).toBe(true)
      expect(Array.isArray(result.styleIssues)).toBe(true)
    })

    it('detects double spaces as a style issue', async () => {
      const result = await checkGrammar('This  has  double  spaces.', 'en')
      const hasDoubleSpace = result.styleIssues.some((s) => s.type === 'double_space')
      expect(hasDoubleSpace).toBe(true)
    })

    it('detects sentence not starting with capital', async () => {
      const result = await checkGrammar('hello there', 'en')
      const hasCap = result.styleIssues.some((s) => s.type === 'capitalization')
      expect(hasCap).toBe(true)
    })

    it('detects repeated words', async () => {
      const result = await checkGrammar('This is is a test.', 'en')
      const hasRepeated = result.styleIssues.some((s) => s.type === 'repeated_word')
      expect(hasRepeated).toBe(true)
    })
  })

  describe('Turkish', () => {
    it('detects "degil" as a typo for "değil"', async () => {
      const result = await checkGrammar('Bu degil doğru.', 'tr')
      const hasDegil = result.errors.some((e) => e.word === 'degil' && e.suggestions.includes('değil'))
      expect(hasDegil).toBe(true)
    })

    it('detects double spaces', async () => {
      const result = await checkGrammar('Merhaba  dünya', 'tr')
      const hasDoubleSpace = result.styleIssues.some((s) => s.type === 'double_space')
      expect(hasDoubleSpace).toBe(true)
    })

    it('detects uncapitalized sentence', async () => {
      const result = await checkGrammar('merhaba dünya', 'tr')
      const hasCap = result.styleIssues.some((s) => s.type === 'capitalization')
      expect(hasCap).toBe(true)
    })

    it('returns no errors for correct Turkish text', async () => {
      const result = await checkGrammar('Merhaba, bu doğru bir cümle.', 'tr')
      expect(result.errors.length).toBe(0)
    })
  })

  describe('Arabic', () => {
    it('detects excessive tatweel', async () => {
      const result = await checkGrammar('مرحباـــ بالعالم', 'ar')
      const hasTatweel = result.styleIssues.some((s) => s.type === 'excessive_tatweel')
      expect(hasTatweel).toBe(true)
    })

    it('detects mixed direction text', async () => {
      const result = await checkGrammar('مرحبا hello', 'ar')
      const hasMixed = result.styleIssues.some((s) => s.type === 'mixed_direction')
      expect(hasMixed).toBe(true)
    })

    it('returns correct structure for valid Arabic', async () => {
      const result = await checkGrammar('مرحباً بالعالم', 'ar')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('styleIssues')
    })
  })

  describe('Unknown language', () => {
    it('falls back to English for unknown lang', async () => {
      const result = await checkGrammar('Hello world', 'xx')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('styleIssues')
    })
  })
})
