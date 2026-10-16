import type { Booking } from '~/types/api'
import { LOGIN_PATH, loginPathFor } from '~/utils/adminNav'
import { pendingCount } from '~/utils/bookingFilters'
import type { BookingRepository, RepositoryState } from '~/utils/bookingRepository'

/**
 * Why the login page is shown again (spec section 5): the session ended ("กรุณาเข้าสู่ระบบอีกครั้ง"), or the
 * sandbox it belonged to is older than 24 hours and was deleted (the sandbox_expired message).
 */
export type AdminNotice = 'signed_out' | 'sandbox_expired'

/**
 * The back office's session, for its pages and the header. The session token itself is kept by the adapter
 * (app/utils/bookingRepository.ts) in localStorage; app/middleware/admin-access.global.ts sends a visitor
 * without one to the login page.
 */
export function useAdminSession() {
  const repository = useBookingRepository()
  const notice = useState<AdminNotice | null>('admin:notice', () => null)
  const router = useRouter()
  const { clear } = useAdminBookings()

  /**
   * After a request failed: when the session or its sandbox is gone, go to the login page, which says why.
   * Returns true when it did; every other state is for the page to show.
   */
  async function leaveIfSignedOut(state: RepositoryState): Promise<boolean> {
    if (state !== 'unauthorized' && state !== 'sandbox_expired') return false
    notice.value = state === 'unauthorized' ? 'signed_out' : 'sandbox_expired'
    clear()
    await navigateTo(state === 'unauthorized' ? loginPathFor(router.currentRoute.value.fullPath) : LOGIN_PATH)
    return true
  }

  /** "ออกจากระบบ": ends the session (the sandbox and its data stay) and goes to the login page. */
  async function logout() {
    await repository.logout()
    notice.value = null
    clear()
    await navigateTo(LOGIN_PATH)
  }

  return { repository, notice, leaveIfSignedOut, logout }
}

/** The request for the bookings while it is on its way, so the layout and the page that both ask share it. */
let loadingBookings: ReturnType<BookingRepository['listBookings']> | null = null

/**
 * The bookings of the visitor's sandbox, shared by the booking list and the number on the "การจอง" tab, so a
 * status changed on a card updates both at once.
 */
export function useAdminBookings() {
  const list = useState<{ today: string, bookings: Booking[] } | null>('admin:bookings', () => null)
  const repository = useBookingRepository()

  async function load() {
    loadingBookings ??= repository.listBookings().finally(() => {
      loadingBookings = null
    })
    const result = await loadingBookings
    if (result.ok) list.value = { today: result.data.today, bookings: result.data.bookings }
    return result
  }

  /** Puts a changed booking in place of the old one. */
  function replace(booking: Booking) {
    if (!list.value) return
    list.value = { ...list.value, bookings: list.value.bookings.map(item => (item.code === booking.code ? booking : item)) }
  }

  function clear() {
    list.value = null
  }

  /** null until the bookings are loaded. */
  const pending = computed(() => (list.value ? pendingCount(list.value.bookings, list.value.today) : null))

  return { list, load, replace, clear, pending }
}
