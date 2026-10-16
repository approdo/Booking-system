import { describe, expect, it } from 'vitest'
import {
  addDays,
  BOOKING_CODE_PATTERN,
  bookingCodeFromBytes,
  canChangeStatus,
  customerFieldMessages,
  dayHoursError,
  isIsoDate,
  normalizeBookingCode,
  normalizePhone,
  validateCustomer,
  validateService,
  weekdayOf,
} from '../../app/utils/bookingRules'
import { joinPhrases } from '../../app/utils/phrases'

// The rules both the booking pages and the API check (N8, spec sections 4, 7 and 10). Phone numbers are
// reserved values only (D-010): 02 followed by zeros.

describe('customer name and phone (N8)', () => {
  it('accepts 2 to 100 characters of name, counting Thai marks as characters', () => {
    expect(validateCustomer({ name: 'ทดลอง ตัวอย่าง', phone: '02-000-0000' }).errors).toEqual({})
    expect(validateCustomer({ name: 'ก', phone: '02-000-0000' }).errors).toEqual({ name: 'too_short' })
    expect(validateCustomer({ name: 'กิ', phone: '02-000-0000' }).errors).toEqual({})
    expect(validateCustomer({ name: '   ', phone: '' }).errors).toEqual({ name: 'required', phone: 'required' })
    expect(validateCustomer({ name: 'ก'.repeat(101), phone: '02-000-0000' }).errors).toEqual({ name: 'too_long' })
    expect(validateCustomer({ name: '  ทดลอง   ตัวอย่าง ', phone: '02-000-0000' }).name).toBe('ทดลอง ตัวอย่าง')
  })

  it('accepts 0 + 8 or 9 digits, or +66 + 8 or 9 digits, after removing spaces and dashes', () => {
    for (const phone of ['02-000-0000', '020-000-0000', '02 000 0000', '+66 2 000 0000', '+66 20 000 0000']) {
      expect(validateCustomer({ name: 'ทดลอง', phone }).errors, phone).toEqual({})
    }
    for (const phone of ['12345', '02000000000', '0200000', '+66 2000', '+65 2 000 0000', '02-000-000a']) {
      expect(validateCustomer({ name: 'ทดลอง', phone }).errors, phone).toEqual({ phone: 'invalid' })
    }
  })

  it('stores the phone as digits only, keeping the + of +66', () => {
    expect(normalizePhone('02-000-0000')).toBe('020000000')
    expect(normalizePhone(' +66 2 000 0000 ')).toBe('+6620000000')
  })

  it('has the messages of spec section 10, the invalid phone one mentioning +66', () => {
    expect(customerFieldMessages.name.too_short).toBe('ชื่อต้องมีอย่างน้อย 2 ตัวอักษร')
    expect(joinPhrases(customerFieldMessages.phone.invalid)).toBe('กรุณากรอกเบอร์โทรให้ถูกต้อง ขึ้นต้นด้วย 0 หรือ +66 เช่น 02-000-0000 หรือ +66 2 000 0000')
  })
})

describe('booking numbers (spec section 4)', () => {
  it('maps five random bytes onto the 32-character alphabet without 0, O, 1 and I', () => {
    expect(bookingCodeFromBytes(new Uint8Array([0, 31, 32, 255, 8]))).toBe('NP-2Z2ZA')
    for (let byte = 0; byte < 256; byte++) expect(bookingCodeFromBytes(new Uint8Array(5).fill(byte))).toMatch(BOOKING_CODE_PATTERN)
  })

  it('reads a booking number the way people type it into the search box', () => {
    for (const typed of ['NP-3F8KW', 'np-3f8kw', 'np 3f8kw', '3F8KW', ' 3f8kw ']) expect(normalizeBookingCode(typed), typed).toBe('NP-3F8KW')
    for (const typed of ['NP-3F8K', 'NP-3F8KO', 'สมศรี', '']) expect(normalizeBookingCode(typed), typed).toBeNull()
  })
})

describe('status changes (spec section 4)', () => {
  it('allows only the buttons of the booking card', () => {
    expect(canChangeStatus('pending', 'confirmed')).toBe(true)
    expect(canChangeStatus('pending', 'cancelled')).toBe(true)
    expect(canChangeStatus('confirmed', 'done')).toBe(true)
    expect(canChangeStatus('confirmed', 'cancelled')).toBe(true)
    expect(canChangeStatus('done', 'confirmed')).toBe(true)
    expect(canChangeStatus('cancelled', 'pending')).toBe(true)
    expect(canChangeStatus('pending', 'done')).toBe(false)
    expect(canChangeStatus('done', 'cancelled')).toBe(false)
    expect(canChangeStatus('cancelled', 'confirmed')).toBe(false)
  })
})

describe('back office forms (spec section 7)', () => {
  const categories = ['thai', 'oil']

  it('checks a service: name 2–60, one to four lengths, each once, price 1–100,000', () => {
    const valid = { categoryId: 'thai', name: 'นวดทดลอง', description: '', options: [{ minutes: 90, price: 550 }, { minutes: 60, price: 400 }] }
    const checked = validateService(valid, categories)
    expect(checked.errors).toEqual({})
    expect(checked.service.options.map(option => option.minutes)).toEqual([60, 90])
    expect(validateService({ ...valid, name: '' }, categories).errors).toEqual({ name: 'name_required' })
    expect(validateService({ ...valid, name: 'ก'.repeat(61) }, categories).errors).toEqual({ name: 'name_length' })
    expect(validateService({ ...valid, categoryId: 'spa' }, categories).errors).toEqual({ categoryId: 'category_unknown' })
    expect(validateService({ ...valid, options: [] }, categories).errors).toEqual({ options: 'options_required' })
    expect(validateService({ ...valid, options: [{ minutes: 60, price: 1 }, { minutes: 60, price: 2 }] }, categories).errors).toEqual({ options: 'minutes_repeated' })
    expect(validateService({ ...valid, options: [{ minutes: 50, price: 400 }] }, categories).errors).toEqual({ options: 'minutes_invalid' })
    expect(validateService({ ...valid, options: [{ minutes: 60, price: 100_001 }] }, categories).errors).toEqual({ options: 'price_invalid' })
  })

  it('checks a day of opening hours: closing after opening, last booking in between', () => {
    const day = { weekday: 1, closed: false, open: '10:00', close: '22:00', lastBooking: '20:30' }
    expect(dayHoursError(day)).toBeUndefined()
    expect(dayHoursError({ ...day, close: '09:00' })).toBe('close_before_open')
    expect(dayHoursError({ ...day, lastBooking: '22:00' })).toBe('last_booking_outside')
    expect(dayHoursError({ ...day, open: '10:15' })).toBe('time_invalid')
    expect(dayHoursError({ ...day, close: '09:00', closed: true })).toBeUndefined()
  })
})

describe('dates', () => {
  it('checks real calendar dates and counts days across months', () => {
    expect(isIsoDate('2026-10-17')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('17/10/2026')).toBe(false)
    expect(addDays('2026-10-30', 13)).toBe('2026-11-12')
    expect(weekdayOf('2026-10-17')).toBe(6)
  })
})
