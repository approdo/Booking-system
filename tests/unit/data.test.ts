import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openingHours } from '../../app/data/hours'
import { serviceCategories } from '../../app/data/services'
import { therapists } from '../../app/data/team'
import type { ImageFile } from '../../app/types/content'

// Rules of the shop data in app/data/, not its example content (lesson G-018): they keep passing when
// the shop's own services, team and hours go in, and fail when one is incomplete or out of range.

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** The lengths the back office can choose for a service option (spec section 7). */
const OPTION_MINUTES = [30, 45, 60, 90, 120, 150, 180]
const TIME = /^([01]\d|2[0-3]):(00|30)$/

const publicImages = new URL('../../public/images/', import.meta.url)
const credits = readFileSync(new URL('../../CREDITS.md', import.meta.url), 'utf8')

function expectUniqueIds(items: readonly { id: string }[], label: string) {
  expect(items.length, `${label}: at least one`).toBeGreaterThan(0)
  for (const { id } of items) expect(id, `${label} id`).toMatch(KEBAB_CASE)
  expect(new Set(items.map(item => item.id)).size, `${label}: ids are unique`).toBe(items.length)
}

/**
 * Width and height of a WebP file, from its header: the canvas size in a VP8X chunk, or the frame size
 * of a lossy (VP8) or lossless (VP8L) image.
 */
function webpSize(bytes: Buffer): { width: number, height: number } {
  expect(bytes.toString('ascii', 0, 4) + bytes.toString('ascii', 8, 12)).toBe('RIFFWEBP')
  const chunk = bytes.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  throw new Error(`unknown WebP chunk ${chunk}`)
}

/** The image is in public/images/ with the size written in the data, so it keeps its space while it loads. */
function expectImage(image: ImageFile, label: string) {
  const url = new URL(image.file, publicImages)
  expect(existsSync(url), `${label}: public/images/${image.file}`).toBe(true)
  if (image.file.endsWith('.webp')) expect(webpSize(readFileSync(url)), `${label}: size`).toEqual({ width: image.width, height: image.height })
}

describe('services', () => {
  it('have unique category and service ids, and a name, description and photo per category', () => {
    expectUniqueIds(serviceCategories, 'categories')
    expectUniqueIds(serviceCategories.flatMap(category => category.items), 'services')
    for (const category of serviceCategories) {
      expect(category.name.trim(), `${category.id} name`).not.toBe('')
      expect(category.description.trim(), `${category.id} description`).not.toBe('')
      expect(category.items.length, `${category.id}: at least one service`).toBeGreaterThan(0)
      expectImage(category.image, `${category.id} photo`)
    }
  })

  it('have a name, a description of at most 200 characters and one to four options each', () => {
    for (const item of serviceCategories.flatMap(category => category.items)) {
      expect(item.name.trim(), `${item.id} name`).not.toBe('')
      expect(item.description.trim().length, `${item.id} description`).toBeGreaterThan(0)
      expect(item.description.length, `${item.id} description`).toBeLessThanOrEqual(200)
      expect(item.options.length, `${item.id} options`).toBeGreaterThanOrEqual(1)
      expect(item.options.length, `${item.id} options`).toBeLessThanOrEqual(4)
    }
  })

  it('offer lengths the back office knows, shortest first, each once, at a whole price from 1 to 100,000 baht', () => {
    for (const item of serviceCategories.flatMap(category => category.items)) {
      const minutes = item.options.map(option => option.minutes)
      for (const length of minutes) expect(OPTION_MINUTES, `${item.id} minutes`).toContain(length)
      expect(minutes, `${item.id}: shortest first, no length twice`).toEqual([...new Set(minutes)].sort((a, b) => a - b))
      for (const { price } of item.options) {
        expect(Number.isInteger(price) && price >= 1 && price <= 100_000, `${item.id} price ${price}`).toBe(true)
      }
    }
  })
})

describe('therapists', () => {
  it('have unique ids, a name, a one-letter avatar, a role, years of experience and a specialty', () => {
    expectUniqueIds(therapists, 'therapists')
    for (const therapist of therapists) {
      expect(therapist.name.trim(), `${therapist.id} name`).not.toBe('')
      expect([...therapist.initial], `${therapist.id} initial`).toHaveLength(1)
      expect(therapist.role.trim(), `${therapist.id} role`).not.toBe('')
      expect(Number.isInteger(therapist.years) && therapist.years >= 0, `${therapist.id} years`).toBe(true)
      expect(therapist.specialty.join('').trim(), `${therapist.id} specialty`).not.toBe('')
    }
  })

  it('have regular days off from 0 (Sunday) to 6 (Saturday), each once, and work at least one day', () => {
    for (const therapist of therapists) {
      for (const day of therapist.daysOff) expect(day, `${therapist.id} day off`).toBeGreaterThanOrEqual(0)
      for (const day of therapist.daysOff) expect(day, `${therapist.id} day off`).toBeLessThanOrEqual(6)
      expect(new Set(therapist.daysOff).size, `${therapist.id} days off are unique`).toBe(therapist.daysOff.length)
      expect(therapist.daysOff.length, `${therapist.id} works`).toBeLessThan(7)
    }
  })
})

describe('opening hours', () => {
  it('have one entry per day of the week, Sunday first', () => {
    expect(openingHours.map(day => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('open before the last booking, which is before closing, all on the half hour', () => {
    for (const day of openingHours) {
      for (const time of [day.open, day.lastBooking, day.close]) expect(time, `weekday ${day.weekday}`).toMatch(TIME)
      expect(day.open < day.lastBooking && day.lastBooking < day.close, `weekday ${day.weekday}`).toBe(true)
    }
  })
})

describe('CREDITS.md', () => {
  // Photos are listed by their path in public/images/ (as on Business-site), other files by their path from the repository root.
  it('names every file in public/ (photos, icons and the link preview)', () => {
    const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))
    const files = (readdirSync(publicDir, { recursive: true }) as string[])
      .map(path => path.replaceAll('\\', '/'))
      .filter(path => statSync(join(publicDir, path)).isFile())
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const name = file.startsWith('images/') ? file.slice('images/'.length) : `public/${file}`
      expect(credits, file).toContain(`\`${name}\``)
    }
  })
})
