import { describe, expect, it } from 'vitest'
import type { DayHours } from '../../app/types/api'
import { shortDateWithYear, weekdayName } from '../../app/utils/bookingFormat'
import { dayHoursError, SERVICE_MINUTES } from '../../app/utils/bookingRules'
import { everyDay, hourChoices, isSameEveryDay, WEEK_ORDER, weekSummary } from '../../app/utils/openingHours'
import { MINUTES_CHOICES, nextFreeMinutes, parsePrice } from '../../app/utils/serviceForm'

// The back office's forms (spec section 7): the opening hours and the service dialog.

const regular = { open: '10:00', close: '22:00', lastBooking: '20:30' }

describe('opening hours', () => {
  it('offers every half hour from 06:00 to 23:30, each one valid for the API', () => {
    const times = hourChoices()
    expect(times[0]).toBe('06:00')
    expect(times.at(-1)).toBe('23:30')
    expect(times).toHaveLength(36)
    expect(dayHoursError({ weekday: 1, closed: false, open: times[0]!, close: times.at(-1)!, lastBooking: times[1]! })).toBeUndefined()
  })

  it('lists the week Monday first', () => {
    expect(WEEK_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(WEEK_ORDER.map(weekdayName)).toEqual(['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'])
  })

  it('knows when every day has the same times, and makes such a week', () => {
    const week = everyDay(regular)
    expect(week.map(day => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(isSameEveryDay(week)).toBe(true)
    expect(isSameEveryDay(week.map(day => (day.weekday === 3 ? { ...day, closed: true } : day)))).toBe(false)
    expect(isSameEveryDay(week.map(day => (day.weekday === 6 ? { ...day, close: '23:00' } : day)))).toBe(false)
  })

  it('sums the week up in lines of days next to each other', () => {
    expect(weekSummary(everyDay(regular))).toEqual(['จันทร์ – อาทิตย์ · 10:00–22:00 น.'])
    const week: DayHours[] = everyDay(regular).map((day) => {
      if (day.weekday === 3) return { ...day, closed: true }
      if (day.weekday === 6 || day.weekday === 0) return { ...day, open: '09:00', close: '23:00' }
      return day
    })
    expect(weekSummary(week)).toEqual([
      'จันทร์ – อังคาร · 10:00–22:00 น.',
      'พุธ · ปิดทั้งวัน',
      'พฤหัสบดี – ศุกร์ · 10:00–22:00 น.',
      'เสาร์ – อาทิตย์ · 09:00–23:00 น.',
    ])
  })
})

describe('service form', () => {
  it('reads a price with commas and spaces, and nothing that is not a whole number', () => {
    expect(parsePrice('1,100')).toBe(1100)
    expect(parsePrice(' 450 ')).toBe(450)
    expect(parsePrice('1 100')).toBe(1100)
    for (const text of ['', 'abc', '12.5', '-5', '1e3', '99999999']) expect(parsePrice(text), text).toBeNaN()
  })

  it('starts a new option with the shortest length not used yet', () => {
    expect(nextFreeMinutes([])).toBe(30)
    expect(nextFreeMinutes([30, 45, 60])).toBe(90)
    expect(nextFreeMinutes([...SERVICE_MINUTES])).toBe(30)
  })

  it('offers every length of the rules', () => {
    expect(MINUTES_CHOICES.map(choice => Number(choice.value))).toEqual(SERVICE_MINUTES)
    expect(MINUTES_CHOICES[0]?.label).toBe('30 นาที')
  })
})

describe('shortDateWithYear', () => {
  it('writes a special closed day with the short weekday and the Buddhist year', () => {
    expect(shortDateWithYear('2026-12-31')).toBe('พฤ. 31 ธ.ค. 2569')
  })
})
