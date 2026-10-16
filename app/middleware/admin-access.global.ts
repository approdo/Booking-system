import { ADMIN_HOME_PATH, ADMIN_ROOT_PATH, LOGIN_PATH, loginPathFor, safeNextPath } from '~/utils/adminNav'
import { isAdminPath } from '~/utils/pageTitle'

/**
 * Who may open which page of the back office (spec section 2, N11). The session token lives in the browser
 * (localStorage), so this runs in the browser only: the pre-rendered HTML of every back-office page is the
 * same for everyone, and Nuxt runs this again before the page comes to life.
 *
 * - No session: every page except the login page leads to the login page, which comes back afterwards.
 * - With a session: /admin/ and the login page lead on to the first tab (or the login page's `next`).
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server || !isAdminPath(to.path)) return

  const path = to.path.endsWith('/') ? to.path : `${to.path}/`
  const signedIn = useBookingRepository().hasSession()

  if (path === LOGIN_PATH) {
    if (signedIn) return navigateTo(safeNextPath(to.query.next) ?? ADMIN_HOME_PATH, { replace: true })
    return
  }
  if (!signedIn) return navigateTo(loginPathFor(to.fullPath), { replace: true })
  if (path === ADMIN_ROOT_PATH) return navigateTo(ADMIN_HOME_PATH, { replace: true })
})
