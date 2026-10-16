import type { SampleBooking } from '../types/content'

// The seven example bookings of the design spec (section 10): six today and one tomorrow, one of each
// status and one with no preferred therapist. Every visitor's sandbox starts with them, marked as starting
// data (no "ใหม่" label). Names are made up and every phone number is the reserved 02-000-0000 (D-010).
//
// Like site.ts, this file is also read outside Nuxt (tests, the back end's seed), so it only imports types.
const phone = '02-000-0000'

export const sampleBookings: readonly SampleBooking[] = [
  { dayOffset: 0, start: '10:00', customerName: 'คุณกานดา', phone, serviceId: 'foot-reflexology', minutes: 60, therapistId: 'somsri', status: 'done', code: 'NP-3F8KW' },
  { dayOffset: 0, start: '11:30', customerName: 'คุณธนากร', phone, serviceId: 'thai-herbal-compress', minutes: 90, therapistId: 'nuanchan', status: 'done', code: 'NP-9QX2M' },
  { dayOffset: 0, start: '13:00', customerName: 'คุณเอมมา', phone, serviceId: 'aroma-oil', minutes: 90, therapistId: 'malai', status: 'confirmed', code: 'NP-H4T7C' },
  { dayOffset: 0, start: '15:00', customerName: 'คุณวิทยา', phone, serviceId: 'neck-shoulder', minutes: 60, therapistId: null, status: 'pending', code: 'NP-2MW8D' },
  { dayOffset: 0, start: '17:30', customerName: 'คุณศิริพร', phone, serviceId: 'hot-stone', minutes: 90, therapistId: 'preecha', status: 'cancelled', code: 'NP-R6J3V' },
  { dayOffset: 0, start: '19:00', customerName: 'คุณมานพ', phone, serviceId: 'thai-traditional', minutes: 60, therapistId: 'preecha', status: 'confirmed', code: 'NP-5TB9L' },
  { dayOffset: 1, start: '11:00', customerName: 'คุณพิมพ์ชนก', phone, serviceId: 'aroma-oil', minutes: 90, therapistId: 'malai', status: 'confirmed', code: 'NP-C8N4F' },
]
