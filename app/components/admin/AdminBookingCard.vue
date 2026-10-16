<script setup lang="ts">
import { seed } from '~/data/seed'
import type { Booking } from '~/types/api'
import { STATUS_NAMES } from '~/utils/bookingFilters'
import { formatPhone, formatPrice } from '~/utils/bookingFormat'
import type { BookingStatus } from '~/utils/bookingRules'
import { phoneHref } from '~/utils/links'
import { bannerFor, restoreTakenBanner } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

/**
 * One booking in the back office's list (spec section 3, BookingCard; design B): a card with a 4px bar in the
 * colour of its status, the time and the status label, the customer, the service, the therapist, the booking
 * number and the phone number. Its buttons change the status at once, without asking (spec section 4): the
 * buttons of "เสร็จแล้ว" and "ยกเลิก" undo a wrong press.
 *
 * While a change is saved its button spins and the others wait. Afterwards the label, the bar and the buttons
 * change in place and screen readers hear "NP-XXXXX เปลี่ยนเป็น … แล้ว"; the page keeps the card in the list
 * even if it no longer matches the filters (`changed`). A failure shows a banner inside the card.
 */
const props = defineProps<{ booking: Booking }>()
const emit = defineEmits<{ changed: [code: string] }>()

const { repository, leaveIfSignedOut } = useAdminSession()
const { replace } = useAdminBookings()
const announce = useAnnounce()

interface Action { to: BookingStatus, label: string, look: 'primary' | 'outline' | 'text' }

/** The buttons of each status (spec section 4). */
const ACTIONS: Record<BookingStatus, Action[]> = {
  pending: [{ to: 'confirmed', label: 'ยืนยัน', look: 'primary' }, { to: 'cancelled', label: 'ยกเลิก', look: 'outline' }],
  confirmed: [{ to: 'done', label: 'เสร็จแล้ว', look: 'primary' }, { to: 'cancelled', label: 'ยกเลิก', look: 'outline' }],
  done: [{ to: 'confirmed', label: 'ย้อนเป็นยืนยันแล้ว', look: 'text' }],
  cancelled: [{ to: 'pending', label: 'คืนคิว', look: 'text' }],
}

/** The 4px bar on the left: the colour of the status. */
const BARS: Record<BookingStatus, string> = {
  pending: 'shadow-[inset_4px_0_0_var(--color-accent)]',
  confirmed: 'shadow-[inset_4px_0_0_var(--color-success)]',
  done: 'shadow-[inset_4px_0_0_var(--color-line)]',
  cancelled: 'shadow-[inset_4px_0_0_var(--color-danger)]',
}

const therapist = computed(() => seed.therapists.find(person => person.id === props.booking.therapistId) ?? null)
const actions = computed(() => ACTIONS[props.booking.status])

/** The status the card is being changed to, while it is saved. */
const saving = ref<BookingStatus | null>(null)
const failure = ref<BannerContent | null>(null)
let lastChange: BookingStatus | null = null

async function change(to: BookingStatus) {
  if (saving.value) return
  lastChange = to
  failure.value = null
  saving.value = to
  const result = await repository.changeStatus(props.booking.code, to)
  saving.value = null

  if (result.ok) {
    replace(result.data.booking)
    emit('changed', props.booking.code)
    announce(`${props.booking.code} เปลี่ยนเป็น ${STATUS_NAMES[to]} แล้ว`)
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  failure.value = result.state === 'slot_taken' ? restoreTakenBanner : bannerFor(result.state)
}

function retry() {
  if (lastChange) change(lastChange)
}
</script>

<template>
  <li
    :class="['grid content-start gap-1 rounded-card border border-line bg-card p-4', BARS[booking.status]]"
    :data-code="booking.code"
  >
    <div class="flex items-center justify-between gap-2.5">
      <span class="font-heading text-[20px] leading-[1.3] font-semibold whitespace-nowrap">{{ booking.start }}–{{ booking.end }}</span>
      <UiStatusBadge :status="booking.status" />
    </div>
    <h3 class="font-body text-[16px] leading-normal font-semibold">
      {{ booking.customerName }}<template v-if="booking.isNew">
        {{ ' ' }}<span class="text-[13px] text-accent">ใหม่</span>
      </template>
    </h3>
    <p class="text-[15px] leading-[1.55]">
      {{ booking.serviceName }} ·
      <span class="whitespace-nowrap">{{ booking.minutes }} นาที</span> ·
      <span class="whitespace-nowrap">{{ formatPrice(booking.price) }}</span>
    </p>
    <p class="flex items-center gap-2 text-[15px] leading-[1.55] text-text-muted">
      <UiAvatar
        :initial="therapist?.initial"
        :any="!therapist"
        :size="28"
      />
      {{ therapist?.name ?? 'ไม่ระบุ' }}
    </p>
    <p class="text-[14px] text-text-muted">
      <span class="whitespace-nowrap">{{ booking.code }}</span> ·
      <a
        :href="phoneHref(booking.phone)"
        class="inline-flex min-h-11 items-center whitespace-nowrap text-text-muted underline underline-offset-3"
      >{{ formatPhone(booking.phone) }}</a>
    </p>
    <div class="mt-1 flex flex-wrap gap-2 border-t border-dashed border-line pt-2.5">
      <template
        v-for="action in actions"
        :key="action.to"
      >
        <UiTextButton
          v-if="action.look === 'text'"
          class="-ml-2"
          :busy="saving === action.to"
          busy-label="กำลังบันทึก…"
          :disabled="saving !== null && saving !== action.to"
          @click="change(action.to)"
        >
          {{ action.label }}
        </UiTextButton>
        <UiButton
          v-else
          :variant="action.look"
          size="sm"
          class="flex-1"
          :busy="saving === action.to"
          busy-label="กำลังบันทึก…"
          :disabled="saving !== null && saving !== action.to"
          @click="change(action.to)"
        >
          {{ action.label }}
        </UiButton>
      </template>
    </div>
    <UiStatusBanner
      v-if="failure"
      class="mt-2"
      focus-on-mount
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="retry"
    />
  </li>
</template>
