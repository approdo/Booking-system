import { accessRedirect } from '~/utils/adminNav'
import { isAdminPath } from '~/utils/pageTitle'

/**
 * Who may open which page of the back office (spec section 2, N11; the rules: accessRedirect). The session token
 * lives in the browser (localStorage), so this runs in the browser only: the pre-rendered HTML of every
 * back-office page is the same for everyone, and Nuxt runs this again before the page comes to life.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server || !isAdminPath(to.path)) return

  const signedIn = useBookingRepository().hasSession()
  const target = accessRedirect({ path: to.path, fullPath: to.fullPath, next: to.query.next }, signedIn)
  if (!target) return

  // A page opened from its address shows its pre-rendered HTML, which Vue then takes over (hydration). Leading
  // to another page at that moment would draw that page over this HTML, and Vue reports a hydration mismatch.
  // So on the first load the page comes to life as itself, and moves on right after; meanwhile it asks the API
  // nothing without a session (onSignedInMounted, app/composables/useAdminSession.ts).
  const nuxtApp = useNuxtApp()
  if (nuxtApp.isHydrating && nuxtApp.payload.serverRendered) {
    nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
      nuxtApp.runWithContext(() => navigateTo(target, { replace: true }))
    })
    return
  }
  return navigateTo(target, { replace: true })
})
