/**
 * Reads values from the token file, app/assets/css/tokens.css, for the scripts and the unit tests,
 * so that colours and the font name are written in that one file only.
 *
 * Plain TypeScript without imports: Node 22.18+ runs it as it is (it strips the types), and
 * Vitest and `nuxt typecheck` read it like any other TypeScript file.
 */

/** Every colour token: readColorTokens(css)['primary'] is the value of --color-primary. */
export function readColorTokens(css: string): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match as unknown as [string, string, string]
    colors[name] = value.trim()
  }
  return colors
}

/**
 * Every custom property of the token file by name, without its leading dashes:
 * readTokens(css)['radius-card'] is the value of --radius-card. `--color-*: initial` is left out.
 */
export function readTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    const [, name, value] = match as unknown as [string, string, string]
    tokens[name] = value.trim()
  }
  return tokens
}

/** One colour token, which must be written as #rrggbb (the format the scripts can use as it is). */
export function readColor(css: string, name: string): string {
  const value = readColorTokens(css)[name]
  if (!value) throw new Error(`--color-${name} is missing from app/assets/css/tokens.css`)
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--color-${name} must be written as #rrggbb, not ${value}`)
  return value
}

/**
 * The families of a font token, in order, without quotes:
 * readFontFamilies(css) on `--font-sans: "A", "B", sans-serif;` returns ['A', 'B', 'sans-serif'].
 */
export function readFontFamilies(css: string, token = 'sans'): string[] {
  const match = css.match(new RegExp(`--font-${token}:\\s*([^;]+);`))
  if (!match?.[1]) throw new Error(`--font-${token} is missing from app/assets/css/tokens.css`)
  return match[1].split(',').map(family => family.trim().replace(/^["']|["']$/g, ''))
}

/** Relative luminance of a #rrggbb colour (WCAG 2.x). */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Contrast ratio of two #rrggbb colours (WCAG 2.x), from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}
