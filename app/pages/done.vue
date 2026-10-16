<script setup lang="ts">
import { seed } from '~/data/seed'
import type { Booking } from '~/types/api'
import { readLastBooking } from '~/utils/bookingDraft'
import { formatPhone, formatPrice, longDate, timeRange } from '~/utils/bookingFormat'

// Step 5, the confirmation (spec section 6): the booking number to show at the shop, its status
// ("รอยืนยัน" - only the shop changes it), the details, and the way into the back office to see this booking
// there. The booking comes from sessionStorage (booking-system:last-booking), so a reload keeps the page;
// without one the visitor goes back to the first screen.
const heading = ref<HTMLElement | null>(null)
useBookingStep(5, heading)
const repository = useBookingRepository()
const announce = useAnnounce()

/** The back office's list of every day's bookings, where this booking has the label "ใหม่". */
const BOOKINGS_PATH = '/admin/bookings/?day=all'

const booking = ref<Booking | null>(null)
const adminLink = ref(`/admin/login/?next=${encodeURIComponent(BOOKINGS_PATH)}`)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

onMounted(async () => {
  booking.value = readLastBooking()
  if (!booking.value) {
    await navigateTo('/', { replace: true })
    return
  }
  // Already signed in to the back office: straight to the list.
  if (repository.hasSession()) adminLink.value = BOOKINGS_PATH
})

onBeforeUnmount(() => clearTimeout(copiedTimer))

const details = computed(() => {
  const value = booking.value
  if (!value) return []
  const therapist = seed.therapists.find(person => person.id === value.therapistId)
  return [
    { term: 'บริการ', value: [`${value.serviceName} · `, `${value.minutes} นาที`] },
    { term: 'หมอนวด', value: therapist?.name ?? 'ไม่ระบุ' },
    { term: 'วันเวลา', value: [`${longDate(value.date)} `, timeRange(value.start, value.end)] },
    { term: 'ชื่อ', value: value.customerName },
    { term: 'เบอร์โทร', value: [formatPhone(value.phone)] },
    { term: 'ราคา', value: [`${formatPrice(value.price)} · `, 'จ่ายที่ร้าน'] },
  ]
})

async function copyCode() {
  if (!booking.value) return
  try {
    await navigator.clipboard.writeText(booking.value.code)
  }
  catch {
    // No clipboard (an old browser, or permission refused): the number stays on the screen to copy by hand.
    return
  }
  copied.value = true
  announce('คัดลอกแล้ว')
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <div class="mx-auto w-[min(100%-32px,760px)] pt-6 pb-9 text-center">
    <div
      aria-hidden="true"
      class="mx-auto mb-3.5 grid size-[72px] place-items-center rounded-full border-2 border-success bg-card text-success"
    >
      <UiIcon
        name="check"
        :size="34"
        :stroke-width="2.2"
      />
    </div>
    <h1
      ref="heading"
      tabindex="-1"
      class="text-[clamp(28px,6vw,40px)]"
    >
      <PhraseText :text="['จองคิว', 'เรียบร้อยแล้ว']" />
    </h1>
    <p class="mt-1.5 text-text-muted">
      <PhraseText :text="['แสดงเลขจองนี้ที่หน้าร้าน ', 'และมาก่อนเวลา', 'ประมาณ 10 นาที']" />
    </p>

    <UiLoading
      v-if="!booking"
      class="mx-auto mt-[22px] max-w-[520px]"
    >
      <div class="skeleton h-[420px] rounded-card" />
    </UiLoading>
    <template v-else>
      <div class="mx-auto mt-[22px] max-w-[520px] rounded-card border border-line bg-card text-left shadow-card">
        <div class="border-b-2 border-dashed border-line px-6 pt-5 pb-[18px] text-center">
          <p class="text-[14px] font-semibold tracking-[.08em] text-gold-ink">
            เลขจอง
          </p>
          <p
            id="booking-code"
            class="font-heading text-[40px] leading-[1.25] font-semibold tracking-[.04em] whitespace-nowrap text-accent"
          >
            {{ booking.code }}
          </p>
          <div class="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <UiStatusBadge :status="booking.status" />
            <UiTextButton
              icon="copy"
              @click="copyCode"
            >
              {{ copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขจอง' }}
            </UiTextButton>
          </div>
        </div>
        <div class="px-6 pt-[18px] pb-[22px] text-[15px] [&_dl]:gap-y-2.5">
          <BookingDetails
            :rows="details"
            align="end"
          />
        </div>
      </div>
      <p class="mx-auto mt-[18px] max-w-[520px] text-[14px] text-text-muted">
        <PhraseText :text="['เว็บไซต์ตัวอย่าง ', '— การจองนี้เป็นข้อมูลทดลอง ', 'ร้านไม่ได้รับคิวจริง']" />
      </p>
      <div class="mt-[22px] flex flex-wrap justify-center gap-3">
        <UiButton to="/">
          จองคิวอีกครั้ง
        </UiButton>
        <UiButton
          variant="outline"
          :to="adminLink"
        >
          ดูคิวนี้ในหลังบ้าน (ทดลอง)
        </UiButton>
      </div>
    </template>
  </div>
</template>
