import type { ImageFile } from '~/types/content'

/**
 * Returns a function that gives the URL of an image in public/images/.
 * Nuxt does not add the base path (e.g. '/Booking-system/') to files in public/, so it is joined here
 * (lesson G-020).
 */
export function useImageUrl() {
  const { app } = useRuntimeConfig()
  return (image: ImageFile) => `${app.baseURL}images/${image.file}`
}
