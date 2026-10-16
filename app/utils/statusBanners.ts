import type { ThaiText } from '../types/content'
import type { RepositoryState } from './bookingRepository'

/**
 * What the pages show when a request to the booking API does not give data (spec section 5), for both
 * the booking pages and the back office. The words are those of `stateMessages` in bookingRepository.ts,
 * split into phrases so a line breaks only between them (lesson G-007); the unit tests check that the
 * phrases join back into exactly those words.
 */

export type BannerVariant = 'info' | 'warning' | 'error'

export interface BannerContent {
  variant: BannerVariant
  title: ThaiText | null
  text: ThaiText
  /** true: the banner has the outline button "ลองใหม่", which sends the same request again. */
  retry: boolean
}

export const RETRY_LABEL = 'ลองใหม่'

/**
 * The label of a button whose press creates the visitor's sandbox (spec section 5, `preparing`): the
 * words of stateMessages.preparing as phrases, so a narrow button breaks the line between them.
 */
export const preparingLabel: readonly string[] = ['กำลังเตรียม', 'ข้อมูลตัวอย่าง…']

const rateLimited: BannerContent = {
  variant: 'warning',
  title: null,
  text: ['ส่งคำขอถี่เกินไป ', 'กรุณารอสักครู่', 'แล้วลองใหม่'],
  retry: false,
}

const demoFull: BannerContent = {
  variant: 'warning',
  title: ['เดโมเต็มชั่วคราว'],
  text: ['ยังดูข้อมูลได้ตามปกติ ', 'ลองจองหรือแก้ไขใหม่ได้', 'หลัง 07:00 น.'],
  retry: false,
}

const unavailable: BannerContent = {
  variant: 'error',
  title: ['เชื่อมต่อระบบจองไม่ได้'],
  text: ['ตรวจสอบอินเทอร์เน็ต', 'แล้วกด “ลองใหม่”'],
  retry: true,
}

const sandboxExpired: BannerContent = {
  variant: 'info',
  title: null,
  text: ['ข้อมูลทดลองของคุณ', 'เกิน 24 ชั่วโมง', 'และถูกลบแล้ว ', '— เริ่มใหม่', 'จากข้อมูลตัวอย่าง'],
  retry: false,
}

/** The four states of spec section 5 that come from the API, word for word. */
export const stateBanners = {
  rate_limited: rateLimited,
  demo_full: demoFull,
  unavailable,
  sandbox_expired: sandboxExpired,
} as const

/** The booking was refused because the time is no longer free (spec section 5, screen 4 → screen 3). */
export const slotTakenBanner: BannerContent = {
  variant: 'warning',
  title: null,
  text: ['ช่วงเวลานี้เพิ่งมีคนจองไป ', 'เลือกเวลาใหม่อีกครั้ง'],
  retry: false,
}

/** The back office: the password or email was wrong (spec section 5). */
export const invalidCredentialsBanner: BannerContent = {
  variant: 'error',
  title: null,
  text: ['อีเมลหรือรหัสผ่าน', 'ไม่ถูกต้อง'],
  retry: false,
}

/** The back office: the session has ended (401), so the login page asks again (spec section 5). */
export const signedOutBanner: BannerContent = {
  variant: 'info',
  title: null,
  text: ['กรุณาเข้าสู่ระบบอีกครั้ง'],
  retry: false,
}

/** The back office: "คืนคิว" of a cancelled booking whose time has been taken since (spec section 4). */
export const restoreTakenBanner: BannerContent = {
  variant: 'warning',
  title: null,
  text: ['ช่วงเวลานี้มีคิวอื่นแล้ว ', 'คืนคิวไม่ได้'],
  retry: false,
}

/**
 * The banner for a failed request. States that only the back office meets, or that a page handles on
 * its own (field errors, a taken time), fall back to "เชื่อมต่อระบบจองไม่ได้": the request can be sent again.
 */
export function bannerFor(state: RepositoryState): BannerContent {
  switch (state) {
    case 'rate_limited':
    case 'demo_full':
    case 'unavailable':
    case 'sandbox_expired':
      return stateBanners[state]
    case 'slot_taken':
      return slotTakenBanner
    default:
      return unavailable
  }
}
