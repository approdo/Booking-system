import { describe, expect, it } from 'vitest'
import { sampleCustomer } from '../../app/data/sampleCustomer'
import { seed } from '../../app/data/seed'
import {
  canOpenStep,
  firstIncompletePath,
  parseDraft,
  parseLastBooking,
  withDate,
  withService,
  withTherapist,
} from '../../app/utils/bookingDraft'
import type { BookingDraft } from '../../app/utils/bookingDraft'
import {
  dayPeriod,
  formatPhone,
  formatPrice,
  longDate,
  monthHeading,
  shortDate,
  spokenDate,
  thaiToday,
  timeRange,
} from '../../app/utils/bookingFormat'
import { stateMessages } from '../../app/utils/bookingRepository'
import { validateCustomer } from '../../app/utils/bookingRules'
import { BOOKING_STEP_PATHS, BOOKING_STEPS, bookingStepNumber } from '../../app/utils/bookingSteps'
import { joinPhrases } from '../../app/utils/phrases'
import { findChoice, servicesFromCategories } from '../../app/utils/serviceChoices'
import { bannerFor, preparingLabel, slotTakenBanner, stateBanners } from '../../app/utils/statusBanners'

// The rules behind the five booking screens (spec sections 2, 5, 6 and 10): which screen may open, what a
// change of answer clears, how days, times and phone numbers are written, and that the banners say exactly
// the words of the spec. Example values are reserved ones (D-010).

const service = { id: 'thai-traditional', name: 'นวดแผนไทย', minutes: 90, price: 550 }
const therapist = { id: 'nuanchan', name: 'นวลจันทร์' }
const complete: BookingDraft = { service, therapist, date: '2026-10-18', time: { start: '14:00', end: '15:30' } }

describe('the booking steps', () => {
  it('are five screens whose paths end with "/" and give their own number back', () => {
    expect(BOOKING_STEPS).toHaveLength(5)
    expect(new Set(BOOKING_STEP_PATHS).size).toBe(5)
    BOOKING_STEPS.forEach((step, index) => {
      expect(step.path.endsWith('/')).toBe(true)
      expect(bookingStepNumber(step.path)).toBe(index + 1)
      expect(bookingStepNumber(step.path.replace(/(.)\/$/, '$1'))).toBe(index + 1)
    })
    expect(bookingStepNumber('/admin/login/')).toBeNull()
  })
})

describe('the draft', () => {
  it('sends a visitor to the first screen whose answer is missing', () => {
    expect(firstIncompletePath({})).toBe('/')
    expect(firstIncompletePath({ service })).toBe('/therapist/')
    expect(firstIncompletePath({ service, therapist })).toBe('/time/')
    expect(firstIncompletePath({ service, therapist, date: '2026-10-18' })).toBe('/time/')
    expect(firstIncompletePath(complete)).toBe('/details/')
  })

  it('opens a screen only when every earlier screen has its answer', () => {
    expect(canOpenStep({}, 2)).toBe(false)
    expect(canOpenStep({ service }, 2)).toBe(true)
    expect(canOpenStep({ service }, 3)).toBe(false)
    expect(canOpenStep({ service, therapist }, 3)).toBe(true)
    expect(canOpenStep({ service, therapist, date: '2026-10-18' }, 4)).toBe(false)
    expect(canOpenStep(complete, 4)).toBe(true)
  })

  it('clears the day and time for another service or length, and the time for another therapist or day', () => {
    expect(withService(complete, service)).toEqual(complete)
    expect(withService(complete, { ...service, minutes: 60 })).toMatchObject({ therapist, date: undefined, time: undefined })
    expect(withTherapist(complete, therapist)).toEqual(complete)
    expect(withTherapist(complete, { id: null, name: 'ไม่ระบุ' })).toMatchObject({ date: '2026-10-18', time: undefined })
    expect(withDate(complete, '2026-10-18')).toEqual(complete)
    expect(withDate(complete, '2026-10-19')).toMatchObject({ date: '2026-10-19', time: undefined })
  })

  it('reads back what was written, and gives an empty draft for broken or partial values', () => {
    expect(parseDraft(JSON.stringify(complete))).toEqual(complete)
    expect(parseDraft(JSON.stringify({ ...complete, therapist: { id: null, name: 'ไม่ระบุ' } })).therapist).toEqual({ id: null, name: 'ไม่ระบุ' })
    expect(parseDraft(null)).toEqual({})
    expect(parseDraft('{not json')).toEqual({})
    expect(parseDraft(JSON.stringify({ therapist }))).toEqual({})
    expect(parseDraft(JSON.stringify({ ...complete, date: '2026-13-40' })).time).toBeUndefined()
  })

  it('accepts a stored booking only with a booking number of the spec\'s format', () => {
    const booking = { code: 'NP-2MW8D', serviceName: 'นวดแผนไทย', minutes: 90, price: 550, date: '2026-10-18', start: '14:00', end: '15:30', customerName: sampleCustomer.name, phone: '020000000' }
    expect(parseLastBooking(JSON.stringify(booking))).toEqual(booking)
    expect(parseLastBooking(JSON.stringify({ ...booking, code: 'NP-0OI1X' }))).toBeNull()
    expect(parseLastBooking(JSON.stringify({ ...booking, price: '550' }))).toBeNull()
    expect(parseLastBooking('[]')).toBeNull()
  })
})

describe('days, times, prices and phone numbers (spec section 10)', () => {
  it('writes Thai dates with Buddhist years', () => {
    expect(longDate('2026-10-18')).toBe('อาทิตย์ 18 ต.ค. 2569')
    expect(shortDate('2026-10-18')).toBe('อา. 18 ต.ค.')
    expect(spokenDate('2026-10-22')).toBe('พฤหัสบดี 22 ตุลาคม')
    expect(timeRange('14:00', '15:30')).toBe('14:00–15:30 น.')
    expect(formatPrice(1100)).toBe('1,100 บาท')
  })

  it('names one month, or both months a week spans', () => {
    expect(monthHeading(['2026-10-17', '2026-10-23'])).toBe('ตุลาคม 2569')
    expect(monthHeading(['2026-10-28', '2026-11-03'])).toBe('ตุลาคม – พฤศจิกายน 2569')
    expect(monthHeading(['2026-12-29', '2027-01-04'])).toBe('ธันวาคม 2569 – มกราคม 2570')
  })

  it('takes today in Thai time (UTC+7)', () => {
    expect(thaiToday(Date.parse('2026-10-16T16:59:00Z'))).toBe('2026-10-16')
    expect(thaiToday(Date.parse('2026-10-16T17:00:00Z'))).toBe('2026-10-17')
  })

  it('splits the day into morning, afternoon and evening at 12:00 and 17:00', () => {
    expect(['11:30', '12:00', '16:30', '17:00'].map(dayPeriod)).toEqual(['morning', 'afternoon', 'afternoon', 'evening'])
  })

  it('writes stored phone numbers the way people read them', () => {
    expect(formatPhone('020000000')).toBe('02-000-0000')
    expect(formatPhone('0200000000')).toBe('020-000-0000')
    expect(formatPhone('+6620000000')).toBe('+6620000000')
  })
})

describe('the button "เติมข้อมูลตัวอย่าง"', () => {
  it('fills a reserved number (D-010) that passes the form\'s checks (N8)', () => {
    expect(validateCustomer(sampleCustomer).errors).toEqual({})
    expect(validateCustomer(sampleCustomer).phone).toMatch(/^0?20+$/)
  })
})

describe('the services of the first screen', () => {
  it('lists every length of the starting data, and finds a chosen length by its radio value', () => {
    const services = servicesFromCategories(seed.serviceCategories)
    expect(services).toHaveLength(seed.serviceCategories.flatMap(category => category.items).length)
    const first = services[0]!
    const option = first.options[0]!
    expect(findChoice(services, `${first.id}:${option.minutes}`)).toEqual({ service: first, option })
    expect(findChoice(services, `${first.id}:7`)).toBeNull()
    expect(findChoice(services, 'no-such-service:60')).toBeNull()
    expect(findChoice(services, null)).toBeNull()
  })
})

describe('the banners (spec section 5)', () => {
  it('say the spec\'s words exactly, as phrases', () => {
    for (const state of ['rate_limited', 'demo_full', 'unavailable', 'sandbox_expired'] as const) {
      const banner = stateBanners[state]
      const message = stateMessages[state]
      expect(joinPhrases(banner.text), state).toBe(message.text)
      expect(banner.title === null ? null : joinPhrases(banner.title), state).toBe(message.title)
    }
    expect(joinPhrases(preparingLabel)).toBe(stateMessages.preparing.text)
    expect(joinPhrases(slotTakenBanner.text)).toBe('ช่วงเวลานี้เพิ่งมีคนจองไป เลือกเวลาใหม่อีกครั้ง')
  })

  it('offer "ลองใหม่" only when the connection failed, and treat unknown states as a failed connection', () => {
    expect(bannerFor('unavailable')).toMatchObject({ variant: 'error', retry: true })
    expect(bannerFor('rate_limited')).toMatchObject({ variant: 'warning', retry: false })
    expect(bannerFor('demo_full')).toMatchObject({ variant: 'warning', retry: false })
    expect(bannerFor('sandbox_expired')).toMatchObject({ variant: 'info', retry: false })
    expect(bannerFor('not_found')).toBe(stateBanners.unavailable)
  })
})
