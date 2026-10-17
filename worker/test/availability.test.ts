import { describe, expect, it } from 'vitest'
import { seed } from '../../app/data/seed'
import { addDays } from '../../app/utils/bookingRules'
import type { AvailabilityContext } from '../src/core/availability'
import { bookingWindow, dayAvailability, isAvailable } from '../src/core/availability'
import type { BusyTime, Therapist } from '../src/core/shop'
import { TODAY } from './helpers'

// AC1 (a)–(c): the rules of src/core/availability.ts on the shop's starting data. Saturday 17 October 2026:
// open 10:00–22:00, last booking 20:30, all four therapists work (their days off are Monday–Thursday).

const therapists: Therapist[] = seed.therapists.map(therapist => ({
  id: therapist.id,
  name: therapist.name,
  initial: therapist.initial,
  role: therapist.role,
  years: therapist.years,
  specialty: [...therapist.specialty],
  workDays: [0, 1, 2, 3, 4, 5, 6].filter(day => !(therapist.daysOff as readonly number[]).includes(day)),
  leaveDates: [],
}))
const hours = seed.openingHours.map(day => ({ weekday: day.weekday, closed: false, open: day.open, close: day.close, lastBooking: day.lastBooking }))
const ids = therapists.map(therapist => therapist.id)

function context(busy: BusyTime[] = [], changes: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return { shop: { therapists, hours, closedDates: [] }, busy, today: TODAY, nowMinutes: 9 * 60, ...changes }
}

/** A booking that holds `therapistId` (null = no preference) from `start` to `end`, 'HH:MM'. */
function busy(therapistId: string | null, start: string, end: string, date = TODAY): BusyTime {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  return { therapistId, date, start: minutes(start), end: minutes(end) }
}

function slotTimes(day: ReturnType<typeof dayAvailability>, available?: boolean) {
  return day.slots.filter(slot => available === undefined || slot.available === available).map(slot => slot.time)
}

describe('times already booked are not offered again (AC1 a)', () => {
  it('takes away the booked therapist\'s overlapping start times only', () => {
    const day = dayAvailability(context([busy('malai', '13:00', '14:30')]), TODAY, 60, 'malai')
    // 60 minutes from 12:30 would end at 13:30, inside the booking; 14:30 starts as it ends.
    expect(slotTimes(day, false)).toEqual(['12:30', '13:00', '13:30', '14:00'])
    expect(slotTimes(day, true)).toContain('14:30')
    expect(isAvailable(context([busy('malai', '13:00', '14:30')]), { date: TODAY, start: 13 * 60, minutes: 60, therapistId: 'malai' })).toBe(false)
    expect(isAvailable(context([busy('malai', '13:00', '14:30')]), { date: TODAY, start: 13 * 60, minutes: 60, therapistId: 'somsri' })).toBe(true)
  })
})

describe('times outside the opening hours are not offered (AC1 b)', () => {
  it('offers every half hour from opening to the last booking, ending by closing time', () => {
    const day = dayAvailability(context(), TODAY, 60, null)
    expect(day.slots[0]?.time).toBe('10:00')
    expect(day.slots.at(-1)?.time).toBe('20:30')
    expect(day.lastBooking).toBe('20:30')
    expect(slotTimes(day)).toHaveLength(22)

    // 180 minutes from 19:30 would end after 22:00.
    expect(slotTimes(dayAvailability(context(), TODAY, 180, null)).at(-1)).toBe('19:00')
    for (const time of [9 * 60 + 30, 21 * 60, 10 * 60 + 15]) {
      expect(isAvailable(context(), { date: TODAY, start: time, minutes: 60, therapistId: null }), `${time}`).toBe(false)
    }
  })

  it('leaves out today\'s times that have passed', () => {
    const day = dayAvailability(context([], { nowMinutes: 14 * 60 + 5 }), TODAY, 60, null)
    expect(day.slots[0]?.time).toBe('14:30')
  })

  it('shows closed days, special closed days and a chosen therapist\'s day off as closed ("หยุด")', () => {
    const closedMonday = hours.map(day => (day.weekday === 1 ? { ...day, closed: true } : day))
    expect(dayAvailability(context([], { shop: { therapists, hours: closedMonday, closedDates: [] } }), '2026-10-19', 60, null).status).toBe('closed')
    expect(dayAvailability(context([], { shop: { therapists, hours, closedDates: ['2026-10-20'] } }), '2026-10-20', 60, null).status).toBe('closed')
    // Somsri's regular day off is Monday; Malai is on leave on 21 October.
    expect(dayAvailability(context(), '2026-10-19', 60, 'somsri').status).toBe('closed')
    const onLeave = therapists.map(therapist => (therapist.id === 'malai' ? { ...therapist, leaveDates: ['2026-10-21'] } : therapist))
    expect(dayAvailability(context([], { shop: { therapists: onLeave, hours, closedDates: [] } }), '2026-10-21', 60, 'malai').status).toBe('closed')
    expect(dayAvailability(context(), '2026-10-19', 60, null).status).toBe('available')
  })

  it('covers today and the next 13 days, and nothing outside them', () => {
    expect(bookingWindow(TODAY)).toHaveLength(14)
    expect(bookingWindow(TODAY).at(-1)).toBe('2026-10-30')
    expect(isAvailable(context(), { date: '2026-10-31', start: 10 * 60, minutes: 60, therapistId: null })).toBe(false)
    expect(isAvailable(context(), { date: '2026-10-16', start: 10 * 60, minutes: 60, therapistId: null })).toBe(false)
  })
})

describe('"no preference" is free while at least one therapist is free (AC1 c)', () => {
  it('stays free until every therapist is busy', () => {
    const threeBusy = ids.slice(0, 3).map(id => busy(id, '15:00', '16:00'))
    expect(isAvailable(context(threeBusy), { date: TODAY, start: 15 * 60, minutes: 60, therapistId: null })).toBe(true)
    const allBusy = ids.map(id => busy(id, '15:00', '16:00'))
    expect(isAvailable(context(allBusy), { date: TODAY, start: 15 * 60, minutes: 60, therapistId: null })).toBe(false)
    expect(dayAvailability(context(allBusy), TODAY, 60, null).slots.find(slot => slot.time === '15:00')?.available).toBe(false)
  })

  it('counts bookings with no preference: they need a therapist too', () => {
    // Three therapists booked and one "no preference" booking: the fourth therapist is taken by it.
    const full = [...ids.slice(0, 3).map(id => busy(id, '15:00', '16:00')), busy(null, '15:00', '16:00')]
    expect(isAvailable(context(full), { date: TODAY, start: 15 * 60, minutes: 60, therapistId: null })).toBe(false)
    expect(isAvailable(context(full), { date: TODAY, start: 15 * 60, minutes: 60, therapistId: ids[3] ?? '' })).toBe(false)
    // Two booked and one "no preference": one therapist is still free, chosen or not.
    const oneLeft = [...ids.slice(0, 2).map(id => busy(id, '15:00', '16:00')), busy(null, '15:00', '16:00')]
    expect(isAvailable(context(oneLeft), { date: TODAY, start: 15 * 60, minutes: 60, therapistId: null })).toBe(true)
    expect(isAvailable(context(oneLeft), { date: TODAY, start: 15 * 60, minutes: 60, therapistId: ids[3] ?? '' })).toBe(true)
  })

  it('is free on a day when only some therapists work', () => {
    // Monday: Somsri is off, three others work.
    expect(dayAvailability(context(), '2026-10-19', 60, null).status).toBe('available')
    const others = ids.filter(id => id !== 'somsri').map(id => busy(id, '10:00', '11:00', '2026-10-19'))
    expect(isAvailable(context(others), { date: '2026-10-19', start: 10 * 60, minutes: 60, therapistId: null })).toBe(false)
  })
})

describe('a therapist\'s leave day (BK-010 AC1)', () => {
  // Saturday 24 October: all four therapists work, Malai is on leave.
  const DAY = '2026-10-24'
  const malaiOnLeave = therapists.map(therapist => (therapist.id === 'malai' ? { ...therapist, leaveDates: [DAY] } : therapist))
  const onLeave = (busyTimes: BusyTime[] = []) => context(busyTimes, { shop: { therapists: malaiOnLeave, hours, closedDates: [] } })
  const others = ids.filter(id => id !== 'malai')

  it('gives the therapist on leave no times that day, and leaves the others and "no preference" free', () => {
    const chosen = dayAvailability(onLeave(), DAY, 60, 'malai')
    expect(chosen.status).toBe('closed')
    expect(chosen.slots).toEqual([])
    expect(dayAvailability(onLeave(), addDays(DAY, 1), 60, 'malai').status).toBe('available')
    for (const therapistId of [...others, null]) {
      const day = dayAvailability(onLeave(), DAY, 60, therapistId)
      expect(day.status, String(therapistId)).toBe('available')
      expect(slotTimes(day, true), String(therapistId)).toHaveLength(22)
    }
  })

  it('counts only the therapists who work for "no preference"', () => {
    // At 15:00 two of the others are booked and one booking has no preference. With Malai at work that leaves
    // one therapist free; with Malai on leave nobody.
    const busyTimes = [busy(others[0]!, '15:00', '16:00', DAY), busy(others[1]!, '15:00', '16:00', DAY), busy(null, '15:00', '16:00', DAY)]
    const at15 = { date: DAY, start: 15 * 60, minutes: 60 }
    expect(isAvailable(context(busyTimes), { ...at15, therapistId: null })).toBe(true)
    expect(isAvailable(onLeave(busyTimes), { ...at15, therapistId: null })).toBe(false)
    expect(isAvailable(onLeave(busyTimes), { ...at15, therapistId: others[2]! })).toBe(false)
    expect(dayAvailability(onLeave(busyTimes), DAY, 60, null).slots.find(slot => slot.time === '15:00')?.available).toBe(false)
  })

  it('closes the day for "no preference" too when nobody works', () => {
    const nobody = therapists.map(therapist => ({ ...therapist, leaveDates: [DAY] }))
    expect(dayAvailability(context([], { shop: { therapists: nobody, hours, closedDates: [] } }), DAY, 60, null).status).toBe('closed')
  })
})
