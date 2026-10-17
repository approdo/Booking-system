import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { seed } from '../../app/data/seed'
import { BOOKING_CODE_PATTERN, minutesFromTime, normalizePhone } from '../../app/utils/bookingRules'

// The starting data that the booking pages are generated from and that the back end copies into every
// sandbox (BK-005 scope 12). Rules, not example values (lesson G-018).

const services = seed.serviceCategories.flatMap(category => category.items)

describe('the example bookings', () => {
  it('use services, lengths and therapists that exist, and booking numbers in the spec\'s format, each once', () => {
    const codes = seed.sampleBookings.map(booking => booking.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const booking of seed.sampleBookings) {
      expect(booking.code).toMatch(BOOKING_CODE_PATTERN)
      const service = services.find(item => item.id === booking.serviceId)
      expect(service?.options.map(option => option.minutes), booking.code).toContain(booking.minutes)
      if (booking.therapistId !== null) expect(seed.therapists.map(therapist => therapist.id), booking.code).toContain(booking.therapistId)
    }
  })

  it('fall inside the opening hours, and never give one therapist two bookings at once', () => {
    const active = seed.sampleBookings.filter(booking => booking.status !== 'cancelled')
    for (const booking of seed.sampleBookings) {
      const start = minutesFromTime(booking.start) ?? -1
      const hours = seed.openingHours[0]!
      expect(start, booking.code).toBeGreaterThanOrEqual(minutesFromTime(hours.open) ?? 0)
      expect(start, booking.code).toBeLessThanOrEqual(minutesFromTime(hours.lastBooking) ?? 0)
      expect(start + booking.minutes, booking.code).toBeLessThanOrEqual(minutesFromTime(hours.close) ?? 0)
    }
    for (const a of active) {
      for (const b of active) {
        if (a === b || a.therapistId === null || a.therapistId !== b.therapistId || a.dayOffset !== b.dayOffset) continue
        const [aStart, bStart] = [minutesFromTime(a.start) ?? 0, minutesFromTime(b.start) ?? 0]
        expect(aStart < bStart + b.minutes && bStart < aStart + a.minutes, `${a.code} / ${b.code}`).toBe(false)
      }
    }
  })

  it('use only the reserved phone numbers of D-010', () => {
    for (const booking of seed.sampleBookings) expect(normalizePhone(booking.phone)).toMatch(/^(\+66)?0?20+$/)
  })
})

describe('one source for the pages and the back end (AC10)', () => {
  it('is imported by both the generated home page and the Worker', () => {
    const page = readFileSync(new URL('../../app/pages/index.vue', import.meta.url), 'utf8')
    const worker = readFileSync(new URL('../../worker/src/core/seed.ts', import.meta.url), 'utf8')
    expect(page).toContain('from \'~/data/seed\'')
    expect(worker).toContain('from \'../../../app/data/seed\'')
  })
})
