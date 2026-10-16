/**
 * Says a short message to screen readers through the layout's one polite live region (spec section 9):
 * Nuxt's <NuxtAnnouncer> in layouts/default.vue. For news that has no place of its own on the screen, such
 * as "เติมข้อมูลตัวอย่างแล้ว" or "คัดลอกแล้ว". The region is emptied first, so the same words said twice are
 * read twice.
 */
export function useAnnounce() {
  const { polite } = useAnnouncer()
  return function announce(text: string) {
    polite('')
    nextTick(() => polite(text))
  }
}
