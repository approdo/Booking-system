import { describe, expect, it } from 'vitest'
import { therapists } from '../../app/data/team'
import { shortWeekdayName, weekdayName } from '../../app/utils/bookingFormat'
import { toggleWorkDay, workSummary } from '../../app/utils/therapistSchedule'

// "ตารางงานหมอนวด" in the back office (spec section 7, BK-010): pressing a day button and the line under a
// therapist's name. Whether the customer can book them on a day is the Worker's rule (worker/test/availability.test.ts).

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

describe('toggleWorkDay', () => {
  it('makes a working day a day off and a day off a working day, sorted as the API keeps them', () => {
    expect(toggleWorkDay(EVERY_DAY, 4)).toEqual([0, 1, 2, 3, 5, 6])
    expect(toggleWorkDay([0, 1, 2, 3, 5, 6], 4)).toEqual(EVERY_DAY)
    expect(toggleWorkDay([5, 1], 0)).toEqual([0, 1, 5])
    expect(toggleWorkDay([3], 3)).toEqual([])
  })

  it('does not change the days it is given', () => {
    const days = [1, 2, 3]
    toggleWorkDay(days, 2)
    expect(days).toEqual([1, 2, 3])
  })
})

describe('workSummary', () => {
  it('names the one day off of each therapist in the starting data (spec section 10)', () => {
    for (const therapist of therapists) {
      const workDays = EVERY_DAY.filter(day => !(therapist.daysOff as readonly number[]).includes(day))
      const off = (therapist.daysOff as readonly number[]).map(weekdayName).join('')
      expect(workSummary({ workDays }), therapist.id).toBe(`ทำงาน 6 วัน · หยุด${off}`)
    }
  })

  it('lists several days off Monday first, as a Thai list', () => {
    expect(workSummary({ workDays: [0, 2, 3, 5, 6] })).toBe('ทำงาน 5 วัน · หยุดจันทร์และพฤหัสบดี')
    expect(workSummary({ workDays: [3, 4, 5, 6] })).toBe('ทำงาน 4 วัน · หยุดจันทร์ อังคาร และอาทิตย์')
  })

  it('says so when a therapist works every day or no day', () => {
    expect(workSummary({ workDays: EVERY_DAY })).toBe('ทำงานทุกวัน')
    expect(workSummary({ workDays: [] })).toBe('หยุดทุกวัน')
  })
})

describe('shortWeekdayName', () => {
  it('gives the short name on a day button, 0 = Sunday', () => {
    expect([1, 2, 3, 4, 5, 6, 0].map(shortWeekdayName)).toEqual(['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'])
  })
})
