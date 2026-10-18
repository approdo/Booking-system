import { browserTokenStorage, createBookingRepository } from '~/utils/bookingRepository'

/**
 * The booking API for pages and components. Its address is public configuration (runtimeConfig.public.apiBase:
 * site.apiUrl, the live API, or localApiUrl in the builds that run on this machine — nuxt.config.ts;
 * NUXT_PUBLIC_API_BASE overrides it when generating). Call the methods in the browser only (event handlers,
 * onMounted): the tokens are in localStorage.
 */
export function useBookingRepository() {
  const { public: { apiBase } } = useRuntimeConfig()
  return createBookingRepository({ baseUrl: apiBase, storage: browserTokenStorage() })
}
