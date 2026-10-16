import type { Therapist } from '../types/content'

// The four therapists, in this order (Thai only, N3). Names, roles, years and specialties are those of
// Business-site (app/data/team.ts), made up for the demo brand; each person has a letter avatar, no photo.
// Regular days off are from the design spec (section 10). Customers may also choose "no preference".
//
// Like site.ts, this file is also read outside Nuxt (tests, the back end's seed), so it only imports types.
export const therapists: readonly Therapist[] = [
  {
    id: 'nuanchan',
    name: 'นวลจันทร์',
    initial: 'น',
    role: 'ผู้ก่อตั้ง · หมอนวดอาวุโส',
    years: 22,
    specialty: ['ถนัดนวดไทย', 'และประคบสมุนไพร'],
    daysOff: [4], // Thursday
  },
  {
    id: 'somsri',
    name: 'สมศรี',
    initial: 'ส',
    role: 'หมอนวด',
    years: 15,
    specialty: ['ถนัดนวดฝ่าเท้า'],
    daysOff: [1], // Monday
  },
  {
    id: 'malai',
    name: 'มาลัย',
    initial: 'ม',
    role: 'หมอนวด',
    years: 12,
    specialty: ['ถนัดนวดน้ำมันอโรมา'],
    daysOff: [2], // Tuesday
  },
  {
    id: 'preecha',
    name: 'ปรีชา',
    initial: 'ป',
    role: 'หมอนวด',
    years: 10,
    specialty: ['ถนัดนวดคลายกล้ามเนื้อ', 'และหินร้อน'],
    daysOff: [3], // Wednesday
  },
]
