import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, readColor, readColorTokens, readFontFamilies, readTokens } from '../../scripts/lib/tokens'

// Rules of the token file, app/assets/css/tokens.css, that must keep holding when a client's colours
// and font go in. The colours themselves are not written here: the tests read them from the file.

const tokensCss = readFileSync(new URL('../../app/assets/css/tokens.css', import.meta.url), 'utf8')

describe('colour tokens', () => {
  it('are all written as #rrggbb, which the brand-images script can use as it is', () => {
    const colors = readColorTokens(tokensCss)
    expect(Object.keys(colors).length).toBeGreaterThan(0)
    for (const [name, value] of Object.entries(colors)) expect(value, `--color-${name}`).toMatch(/^#[0-9a-f]{6}$/i)
  })

  // [text, background, minimum]: 4.5:1 for normal text (WCAG 2.x AA). The Site-starter names first
  // (aliases, see below), then the pairs of the design spec, section 1, by their own names.
  const pairs: [string, string, number][] = [
    ['fg', 'page', 4.5],
    ['fg', 'subtle', 4.5],
    ['fg-muted', 'page', 4.5],
    ['fg-muted', 'subtle', 4.5],
    ['primary', 'page', 4.5],
    ['primary', 'subtle', 4.5],
    ['on-primary', 'primary', 4.5],
    ['on-primary', 'primary-hover', 4.5],
    ...['card', 'bg', 'surface', 'white', 'accent-soft'].map((bg): [string, string, number] => ['text', bg, 4.5]),
    ...['card', 'bg', 'surface', 'white'].map((bg): [string, string, number] => ['text-muted', bg, 4.5]),
    ...['card', 'bg', 'white'].map((bg): [string, string, number] => ['accent', bg, 4.5]),
    ['white', 'accent', 4.5],
    ['white', 'accent-hover', 4.5],
    ['accent-hover', 'accent-soft', 4.5],
    ...['white', 'card'].map((bg): [string, string, number] => ['success', bg, 4.5]),
    ...['white', 'card'].map((bg): [string, string, number] => ['danger', bg, 4.5]),
    ...['card', 'white', 'bg', 'surface'].map((bg): [string, string, number] => ['gold-ink', bg, 4.5]),
    ['bg', 'text', 4.5],
    ...['on-deep', 'on-deep-muted', 'gold-light'].flatMap(fg => ['deep', 'deeper'].map((bg): [string, string, number] => [fg, bg, 4.5])),
  ]

  it.each(pairs)('%s on %s has a contrast of at least %d:1', (text, background, minimum) => {
    expect(contrastRatio(readColor(tokensCss, text), readColor(tokensCss, background))).toBeGreaterThanOrEqual(minimum)
  })

  it('computes contrast like WCAG: black on white is 21:1, a colour on itself 1:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

// The Site-starter names stay as aliases of the design-A tokens with the very same value (spec section 1),
// so the starter's scripts keep working; new code uses the design-A names.
describe('Site-starter aliases', () => {
  const tokens = readTokens(tokensCss)
  const aliases: [string, string][] = [
    ['color-page', 'color-bg'],
    ['color-subtle', 'color-surface'],
    ['color-fg', 'color-text'],
    ['color-fg-muted', 'color-text-muted'],
    ['color-primary', 'color-accent'],
    ['color-primary-hover', 'color-accent-hover'],
    ['color-on-primary', 'color-white'],
    ['color-divider', 'color-line'],
    ['font-sans', 'font-body'],
    ['radius-box', 'radius-card'],
    ['radius-control', 'radius-input'],
    ['shadow-raised', 'shadow-card'],
    ['container-page', 'container'],
  ]

  it.each(aliases)('--%s has the value of --%s', (alias, token) => {
    expect(tokens[token], `--${token}`).toBeDefined()
    expect(tokens[alias], `--${alias}`).toBe(tokens[token])
  })
})

describe('font tokens', () => {
  const families = readFontFamilies(tokensCss)

  const faces = [...tokensCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(match => match[1]!)
  const fallbackFaces = faces.filter(face => face.includes('"Thai Fallback: Tahoma"'))

  it('name a web font first and end with system fonts', () => {
    expect(families[0]).not.toMatch(/^(ui-|system-ui|sans-serif|serif)/)
    expect(families.at(-1)).toBe('sans-serif')
  })

  // The fallback faces were measured for one web font. With another font they are either measured
  // again or deleted together with their name in --font-sans (see tokens.css); both pass here.
  it('use the Thai fallback right after the web font when its faces are defined, and not otherwise', () => {
    if (fallbackFaces.length === 0) expect(families).not.toContain('Thai Fallback: Tahoma')
    else expect(families[1]).toBe('Thai Fallback: Tahoma')
  })

  it('define the Thai fallback, when used, for regular and bold text, for Thai letters only (lesson G-043)', () => {
    if (!families.includes('Thai Fallback: Tahoma')) return
    expect(fallbackFaces.map(face => face.match(/font-weight:\s*(\d+)/)?.[1])).toEqual(['400', '700'])
    for (const face of fallbackFaces) {
      expect(face).toMatch(/src:\s*local\(/)
      expect(face).toMatch(/size-adjust:/)
      expect(face).toContain('unicode-range: U+0E01-0E5B')
    }
  })
})
