<script setup lang="ts">
import type { Booking } from '~/types/api'
import { STATUS_NAMES } from '~/utils/bookingFilters'
import type { BookingStatus } from '~/utils/bookingRules'
import { shortServiceName } from '~/utils/calendarDay'

/**
 * One booking in the calendar (spec sections 3 and 4, EventBlock): a button in the colours of its status that
 * always says the status in words too. Pressing it opens the booking (the page shows its BookingCard in a
 * dialog).
 *
 * - `grid` (1024px and wider): a block in the therapist's column, as high as the booking is long. The page
 *   places it (style). "เวลา คุณชื่อ" in bold over the short service name and the status; a booking shorter
 *   than an hour has room for one line only: the start, the name and the status.
 * - `list` (narrower): a full-width row with the start and end, the customer, the service, the therapist
 *   and the status.
 */
const props = defineProps<{
  booking: Booking
  placement: 'grid' | 'list'
  /** The therapist's name, or "ยังไม่จัดคน" (the list only: in the grid the column says it). */
  therapistName?: string
}>()
defineEmits<{ open: [] }>()

/** The colours of each status (spec section 4, EventBlock). */
const LOOKS: Record<BookingStatus, string> = {
  pending: 'bg-accent-soft text-accent-hover',
  confirmed: 'bg-white text-text shadow-[inset_3px_0_0_var(--color-success),inset_0_0_0_1px_var(--color-line)]',
  done: 'bg-surface text-text-muted',
  cancelled: 'bg-white text-danger line-through shadow-[inset_0_0_0_1px_var(--color-danger)]',
}

const status = computed(() => STATUS_NAMES[props.booking.status])
/** Under an hour, a block is too low for two lines (24px for 30 minutes). */
const oneLine = computed(() => props.placement === 'grid' && props.booking.minutes < 60)
</script>

<template>
  <button
    type="button"
    :data-code="booking.code"
    :data-status="booking.status"
    :class="[
      'group block rounded-[10px] text-left text-[13px] leading-[1.35]',
      placement === 'grid' ? 'overflow-hidden px-2 py-[3px]' : 'min-h-11 w-full px-3 py-2',
      LOOKS[booking.status],
    ]"
    @click="$emit('open')"
  >
    <template v-if="placement === 'list'">
      <span class="block font-semibold group-hover:underline">
        <span class="whitespace-nowrap">{{ booking.start }}–{{ booking.end }}</span> · {{ booking.customerName }}
      </span>
      <span class="block">{{ booking.serviceName }} · {{ therapistName }} · <span class="whitespace-nowrap">{{ status }}</span></span>
    </template>
    <span
      v-else-if="oneLine"
      class="flex gap-1"
    >
      <span class="min-w-0 truncate font-semibold group-hover:underline">{{ booking.start }} {{ booking.customerName }}</span>
      <span class="shrink-0">· {{ status }}</span>
    </span>
    <template v-else>
      <span class="block truncate font-semibold group-hover:underline">{{ booking.start }} {{ booking.customerName }}</span>
      <span class="flex gap-1">
        <span class="min-w-0 truncate">{{ shortServiceName(booking.serviceName) }}</span>
        <span class="shrink-0">· {{ status }}</span>
      </span>
    </template>
  </button>
</template>
