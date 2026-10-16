import type { Ref } from 'vue'
import { canOpenStep, firstIncompletePath, readDraft, writeDraft } from '~/utils/bookingDraft'
import type { BookingDraft } from '~/utils/bookingDraft'
import { bookingStep } from '~/utils/bookingSteps'

/** Booking screens shown since the page was loaded; the first one does not move the focus. */
let screensShown = 0

/**
 * What every booking screen does (spec sections 2 and 6):
 *
 * - sets the page title, '{screen} · จองคิวนวลไพล';
 * - reads the draft from sessionStorage once the page runs in the browser (`ready` turns true), and sends a
 *   visitor who opened screens 2 to 4 without the earlier answers to the first screen that is missing one;
 * - after a change of screen, moves the focus to the heading (it has tabindex="-1").
 *
 * The pre-rendered HTML cannot know the draft, so a screen shows its skeleton until `ready`.
 */
export function useBookingStep(step: number, heading: Ref<HTMLElement | null>) {
  useSeoMeta({ title: pageTitle('customer', bookingStep(step).title) })

  const draft = ref<BookingDraft>({})
  const ready = ref(false)

  function save(next: BookingDraft) {
    draft.value = next
    writeDraft(next)
  }

  onMounted(async () => {
    screensShown += 1
    if (screensShown > 1) heading.value?.focus()
    draft.value = readDraft()
    if (step >= 2 && step <= 4 && !canOpenStep(draft.value, step)) {
      await navigateTo(firstIncompletePath(draft.value), { replace: true })
      return
    }
    ready.value = true
  })

  return { draft, ready, save }
}
