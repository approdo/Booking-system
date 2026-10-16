import { describe, expect, it } from 'vitest'
import type { Booking, Therapist } from '../../app/types/api'
import { weekdayOf } from '../../app/utils/bookingRules'
import {
  bookingsOn,
  calendarColumns,
  columnKeyOf,
  gridRange,
  hourMarks,
  isDayOff,
  PIXELS_PER_MINUTE,
  placeBookings,
  rangeHeight,
  readCalendarDate,
  shortServiceName,
  UNASSIGNED,
} from '../../app/utils/calendarDay'

// "ปฏิทิน" of the back office (spec section 7, BK-009): the day shown, the columns, the hours of the grid and where
// each booking goes. Times are Thai time. Phone numbers are the reserved 02-000-0000 only (D-010).

const TODAY = '2026-10-17' // a Saturday
const OPEN = { closed: false, open: '10:00', close: '22:00' } as const

function booking(code: string, changes: Partial<Booking> = {}): Booking {
  return {
    code,
    serviceId: 'thai-traditional',
    serviceName: 'นวดแผนไทย',
    minutes: 60,
    price: 400,
    therapistId: 'malai',
    date: TODAY,
    start: '10:00',
    end: '11:00',
    customerName: 'คุณกานดา',
    phone: '020000000',
    status: 'pending',
    isNew: false,
    createdAt: '2026-10-17T00:00:00.000Z',
    ...changes,
  }
}

function therapist(id: string, changes: Partial<Therapist> = {}): Therapist {
  return {
    id,
    name: id,
    initial: id.slice(0, 1),
    role: '',
    years: 1,
    specialty: [],
    workDays: [0, 1, 2, 3, 4, 5, 6],
    leaveDates: [],
    ...changes,
  }
}

describe('readCalendarDate', () => {
  it('takes a real date from ?date=, past days included, and today otherwise', () => {
    expect(readCalendarDate('2026-10-20', TODAY)).toBe('2026-10-20')
    expect(readCalendarDate('2026-10-01', TODAY)).toBe('2026-10-01')
    for (const value of [undefined, null, '', '2026-02-30', '17-10-2026', 'today', ['2026-10-20']]) {
      expect(readCalendarDate(value, TODAY), String(value)).toBe(TODAY)
    }
  })
})

describe('columns', () => {
  const team = [therapist('nuanchan'), therapist('somsri')]

  it('has "ยังไม่จัดคน" first, then the therapists in order', () => {
    expect(calendarColumns(team).map(column => [column.key, column.label])).toEqual([
      [UNASSIGNED, 'ยังไม่จัดคน'],
      ['nuanchan', 'nuanchan'],
      ['somsri', 'somsri'],
    ])
  })

  it('puts a booking under its therapist, and one without a known therapist under "ยังไม่จัดคน"', () => {
    expect(columnKeyOf(booking('NP-AAAAA', { therapistId: 'somsri' }), team)).toBe('somsri')
    expect(columnKeyOf(booking('NP-AAAAB', { therapistId: null }), team)).toBe(UNASSIGNED)
    expect(columnKeyOf(booking('NP-AAAAC', { therapistId: 'gone' }), team)).toBe(UNASSIGNED)
  })

  it('knows a regular day off and a leave day, as the API does', () => {
    // นวลจันทร์ is off on Thursdays (spec section 10).
    const nuanchan = therapist('nuanchan', { workDays: [0, 1, 2, 3, 5, 6] })
    expect(weekdayOf('2026-10-22')).toBe(4)
    expect(isDayOff(nuanchan, '2026-10-22')).toBe(true)
    expect(isDayOff(nuanchan, TODAY)).toBe(false)
    expect(isDayOff({ ...nuanchan, leaveDates: [TODAY] }, TODAY)).toBe(true)
  })
})

describe('bookingsOn', () => {
  it('keeps the bookings of the day, cancelled ones too, earliest first', () => {
    const bookings = [
      booking('NP-CCCCC', { start: '15:00' }),
      booking('NP-AAAAA', { start: '10:00', status: 'cancelled' }),
      booking('NP-BBBBB', { start: '10:00' }),
      booking('NP-DDDDD', { date: '2026-10-18' }),
    ]
    expect(bookingsOn(bookings, TODAY).map(item => item.code)).toEqual(['NP-AAAAA', 'NP-BBBBB', 'NP-CCCCC'])
  })
})

describe('gridRange', () => {
  it('runs from opening to closing time, 10:00 to 22:00 = 12 hours of 48px', () => {
    const range = gridRange(OPEN, [])!
    expect(range).toEqual({ from: 600, to: 1320 })
    expect(rangeHeight(range)).toBe(576)
    expect(hourMarks(range).map(mark => mark.time)).toEqual(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'])
    expect(hourMarks(range)[4]).toEqual({ time: '14:00', top: 192 })
  })

  it('widens to whole hours and to bookings outside the hours', () => {
    expect(gridRange({ closed: false, open: '10:30', close: '21:30' }, [])).toEqual({ from: 600, to: 1320 })
    expect(gridRange(OPEN, [booking('NP-AAAAA', { start: '09:00', minutes: 60 }), booking('NP-AAAAB', { start: '21:30', minutes: 90 })]))
      .toEqual({ from: 540, to: 1380 })
  })

  it('on a closed day shows only the hours of its bookings, and nothing without them', () => {
    expect(gridRange({ closed: true }, [])).toBeNull()
    expect(gridRange({ closed: true }, [booking('NP-AAAAA', { start: '13:30', minutes: 90 })])).toEqual({ from: 780, to: 900 })
  })
})

describe('placeBookings', () => {
  const range = { from: 600, to: 1320 }

  it('puts a booking at its start time and makes it as high as it is long', () => {
    const [placed] = placeBookings([booking('NP-AAAAA', { start: '14:00', minutes: 90 })], range)
    expect(placed).toMatchObject({ top: 240 * PIXELS_PER_MINUTE, height: 90 * PIXELS_PER_MINUTE, lane: 0, lanes: 1 })
    expect(placed!.top).toBe(192)
    expect(placed!.height).toBe(72)
  })

  it('gives bookings that overlap a lane each, and one after them the whole width again', () => {
    const placed = placeBookings([
      booking('NP-AAAAA', { start: '17:30', minutes: 90, status: 'cancelled' }),
      booking('NP-AAAAB', { start: '17:30', minutes: 60 }),
      booking('NP-AAAAC', { start: '18:30', minutes: 60 }),
      booking('NP-AAAAD', { start: '20:00', minutes: 60 }),
    ], range)
    const lanes = Object.fromEntries(placed.map(item => [item.booking.code, [item.lane, item.lanes]]))
    expect(lanes).toEqual({
      'NP-AAAAA': [0, 2],
      'NP-AAAAB': [1, 2],
      'NP-AAAAC': [1, 2], // the lane of NP-AAAAB is free again at 18:30
      'NP-AAAAD': [0, 1],
    })
  })

  it('places bookings that only touch (one ends as the next starts) one under the other', () => {
    const placed = placeBookings([booking('NP-AAAAA', { start: '10:00' }), booking('NP-AAAAB', { start: '11:00' })], range)
    expect(placed.map(item => [item.lane, item.lanes])).toEqual([[0, 1], [0, 1]])
  })
})

describe('shortServiceName', () => {
  it('leaves out the leading "นวด", and keeps names without it', () => {
    expect(shortServiceName('นวดคอ บ่า ไหล่')).toBe('คอ บ่า ไหล่')
    expect(shortServiceName('นวดแผนไทย')).toBe('แผนไทย')
    expect(shortServiceName('สปาหน้าสมุนไพรไทย')).toBe('สปาหน้าสมุนไพรไทย')
    expect(shortServiceName('นวด')).toBe('นวด')
  })
})
