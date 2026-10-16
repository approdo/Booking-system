/**
 * What the button "เติมข้อมูลตัวอย่าง" puts into the booking form (D-004, spec section 10): a made-up name
 * and the reserved number 02-000-0000 (lesson G-005, D-010), which passes the form's checks (N8).
 * Visitors must never type real details into the demo; the form says so above its fields.
 *
 * Like site.ts, this file is also read outside Nuxt (tests), so it imports nothing.
 */
export const sampleCustomer = {
  name: 'ทดลอง ตัวอย่าง',
  phone: '02-000-0000',
} as const
