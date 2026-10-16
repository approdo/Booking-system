<script setup lang="ts">
import type { ThaiText } from '~/types/content'
import type { IconName } from '~/utils/icons'
import { formatPrice } from '~/utils/bookingFormat'

/**
 * The bar stuck to the bottom of booking screens 1 to 4 (spec section 3, BottomBar + ActionBar): what is
 * chosen so far and its price on the left, the button to the next screen on the right. It is sticky (not
 * fixed) at the end of <main>, so at the end of the page it sits under the content instead of over it.
 *
 * `blockedReason`: nothing is chosen yet. The button looks switched off but can still be pressed; then it
 * says why ("เลือกหมอนวดก่อน") in the bar and to screen readers.
 */
const props = withDefaults(defineProps<{
  summary: ThaiText
  price?: number | null
  label: string
  icon?: IconName
  type?: 'button' | 'submit'
  form?: string
  busy?: boolean
  busyLabel?: ThaiText
  blockedReason?: string | null
}>(), { price: null, icon: undefined, type: 'button', form: undefined, busyLabel: undefined, blockedReason: null })

const emit = defineEmits<{ next: [] }>()

const announce = useAnnounce()
const shownReason = ref<string | null>(null)

// A new choice replaces the reason with the summary again.
watch(() => props.blockedReason, () => {
  shownReason.value = null
})

function onBlocked() {
  if (!props.blockedReason) return
  shownReason.value = props.blockedReason
  announce(props.blockedReason)
}
</script>

<template>
  <div class="action-bar sticky bottom-0 z-10 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] shadow-bar">
    <div class="mx-auto flex min-h-[76px] w-[min(100%-32px,760px)] items-center gap-3 py-2">
      <p class="mr-auto min-w-0 text-[14px] leading-[1.4] text-text-muted">
        <span v-if="shownReason">{{ shownReason }}</span>
        <PhraseText
          v-else
          :text="summary"
        />
        <strong
          v-if="price !== null"
          class="block font-heading text-[18px] leading-[1.35] font-semibold whitespace-nowrap text-text"
        >{{ formatPrice(price) }}</strong>
      </p>
      <UiButton
        :type="type"
        :form="form"
        :icon="busy ? undefined : icon"
        :busy="busy"
        :busy-label="busyLabel"
        :disabled="Boolean(blockedReason)"
        @blocked="onBlocked"
        @click="emit('next')"
      >
        {{ label }}
      </UiButton>
    </div>
  </div>
</template>
