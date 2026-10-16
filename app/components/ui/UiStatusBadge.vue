<script setup lang="ts">
import type { BookingStatus } from '~/utils/bookingRules'

/** The label of a booking's status (spec sections 3 and 4): the word always, the colour as well. */
const props = defineProps<{ status: BookingStatus }>()

const badges: Record<BookingStatus, { text: string, look: string }> = {
  pending: { text: 'รอยืนยัน', look: 'bg-accent-soft text-accent-hover' },
  confirmed: { text: 'ยืนยันแล้ว', look: 'bg-white text-success shadow-[inset_0_0_0_1.5px_var(--color-success)]' },
  done: { text: 'เสร็จแล้ว', look: 'bg-surface text-text-muted' },
  cancelled: { text: 'ยกเลิก', look: 'bg-white text-danger shadow-[inset_0_0_0_1.5px_var(--color-danger)]' },
}

const badge = computed(() => badges[props.status])
</script>

<template>
  <span :class="['inline-flex items-center rounded-full px-3 text-[14px] leading-[1.8] font-semibold whitespace-nowrap', badge.look]">
    {{ badge.text }}
  </span>
</template>
