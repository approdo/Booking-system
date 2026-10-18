<script setup lang="ts">
import { seed } from '~/data/seed'
import type { Booking } from '~/types/api'
import type { ThaiText } from '~/types/content'
import { STATUS_NAMES } from '~/utils/bookingFilters'
import { fullDate, thaiTime, thaiToday } from '~/utils/bookingFormat'
import { BOOKING_STATUSES } from '~/utils/bookingRules'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'
import { FOLLOWING_LIMIT, hoursOn, todayCounts, upcomingToday } from '~/utils/todaySummary'
import type { HoursOfDay } from '~/utils/todaySummary'

// "วันนี้" (spec section 7, BK-008; design B): the first page after signing in. Today's bookings counted by
// status (each number leads to the booking list filtered to it), the next booking and up to four after it,
// and a link to all of today's bookings. No charts and no money. noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'สรุปวันนี้') })

const BOOKINGS_PATH = '/admin/bookings/'

const { repository, leaveIfSignedOut } = useAdminSession()
const { list, load } = useAdminBookings()

/** loading: on its way · ready: shown · failed: it could not be read (a banner takes its place). */
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<BannerContent | null>(null)
const hours = ref<HoursOfDay | null>(null)

/** The bookings (shared with the booking list and the tab bar) and the shop's hours, read together. */
async function loadSummary() {
  state.value = 'loading'
  const [bookings, shop] = await Promise.all([load(), repository.getAdminShop()])
  if (bookings.ok && shop.ok) {
    hours.value = hoursOn(bookings.data.today, shop.data.hours, shop.data.closedDates)
    state.value = 'ready'
    failure.value = null
    return
  }
  const failed = !bookings.ok ? bookings.state : !shop.ok ? shop.state : 'unavailable'
  if (await leaveIfSignedOut(failed)) return
  state.value = 'failed'
  failure.value = bannerFor(failed)
}

/** The visitor's clock, moved on every 30 seconds so a booking that starts drops off "คิวถัดไป" by itself. */
const nowMs = ref(0)
let clock: ReturnType<typeof setInterval> | undefined

onSignedInMounted(() => {
  nowMs.value = Date.now()
  clock = setInterval(() => {
    nowMs.value = Date.now()
  }, 30_000)
  loadSummary()
})
onBeforeUnmount(() => clearInterval(clock))

const today = computed(() => list.value?.today ?? null)
const counts = computed(() => (list.value && today.value ? todayCounts(list.value.bookings, today.value) : null))
const upcoming = computed(() => {
  if (!list.value || !today.value) return []
  return upcomingToday(list.value.bookings, today.value, { date: thaiToday(nowMs.value), time: thaiTime(nowMs.value) })
})
const next = computed(() => upcoming.value[0] ?? null)
const following = computed(() => upcoming.value.slice(1, 1 + FOLLOWING_LIMIT))
const hasBookingsToday = computed(() => (counts.value ? Object.values(counts.value).some(count => count > 0) : false))

/** 'เสาร์ 17 ตุลาคม 2569 · ร้านเปิด 10:00–22:00 น.', or '… · วันนี้ร้านปิด' (spec section 7). */
const detail = computed<ThaiText | null>(() => {
  if (state.value !== 'ready' || !today.value || !hours.value) return null
  const day = `${fullDate(today.value)} · `
  return hours.value.closed ? [day, 'วันนี้ร้านปิด'] : [day, 'ร้านเปิด ', `${hours.value.open}–${hours.value.close} น.`]
})

const kpis = computed(() => BOOKING_STATUSES.map(status => ({
  status,
  label: STATUS_NAMES[status],
  count: counts.value?.[status] ?? 0,
  to: `${BOOKINGS_PATH}?day=today&status=${status}`,
})))

function therapistName(booking: Booking): string {
  return seed.therapists.find(person => person.id === booking.therapistId)?.name ?? 'ไม่ระบุ'
}
</script>

<template>
  <div class="page-container">
    <div class="max-w-[720px]">
      <AdminPageHead
        title="วันนี้"
        :detail="detail"
      />

      <UiLoading v-if="state === 'loading'">
        <div class="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <div
            v-for="placeholder in 4"
            :key="placeholder"
            class="skeleton h-[74px] rounded-[14px]"
          />
        </div>
        <div class="skeleton h-[122px] rounded-card" />
      </UiLoading>
      <UiStatusBanner
        v-else-if="state === 'failed' && failure"
        :variant="failure.variant"
        :title="failure.title"
        :text="failure.text"
        :retry="failure.retry"
        @retry="loadSummary"
      />
      <template v-else-if="counts">
        <h2 class="sr-only">
          คิววันนี้ตามสถานะ
        </h2>
        <ul
          role="list"
          class="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4"
        >
          <li
            v-for="kpi in kpis"
            :key="kpi.status"
          >
            <NuxtLink
              :to="kpi.to"
              :data-status="kpi.status"
              class="block rounded-[14px] border border-line bg-card px-3.5 py-2.5 text-[14px] leading-[1.4] text-text-muted no-underline transition-[color,background-color,border-color] hover:border-text-muted"
            >
              {{ kpi.label }}
              <span class="block font-heading text-[24px] leading-[1.35] font-semibold text-text">{{ kpi.count }}</span>
            </NuxtLink>
          </li>
        </ul>

        <template v-if="next">
          <section
            id="next-booking"
            aria-labelledby="next-booking-title"
            class="on-dark mb-4 rounded-card bg-deep px-5 py-[18px] text-on-deep"
          >
            <p class="text-[14px] font-semibold tracking-[.08em] text-gold-light">
              คิวถัดไป
            </p>
            <h2
              id="next-booking-title"
              class="mt-0.5 text-[22px] text-on-deep"
            >
              <PhraseText :text="[`${next.start}–${next.end} · `, next.customerName]" />
            </h2>
            <p class="mt-0.5 text-[15px] text-on-deep-muted">
              <PhraseText :text="[`${next.serviceName} `, `${next.minutes} นาที · `, therapistName(next)]" />
            </p>
          </section>

          <ol
            v-if="following.length > 0"
            role="list"
            aria-label="คิวต่อจากนั้น"
            class="mb-2"
          >
            <li
              v-for="booking in following"
              :key="booking.code"
              :data-code="booking.code"
              class="grid grid-cols-[56px_18px_minmax(0,1fr)] gap-x-2.5"
            >
              <span class="text-right font-heading text-[16px] leading-[1.6] font-semibold whitespace-nowrap">{{ booking.start }}</span>
              <span
                aria-hidden="true"
                class="relative before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-line after:absolute after:top-2 after:left-[3px] after:size-3 after:rounded-full after:border-2 after:border-gold after:bg-card"
              />
              <div class="pb-3.5 text-[15px] leading-normal">
                <p class="flex flex-wrap items-center gap-x-1.5">
                  <PhraseText :text="[`${booking.customerName} · `, booking.serviceName]" />
                  <UiStatusBadge :status="booking.status" />
                </p>
                <p class="text-[14px] text-text-muted">
                  {{ therapistName(booking) }}
                </p>
              </div>
            </li>
          </ol>
        </template>
        <UiEmptyState
          v-else
          :text="hasBookingsToday ? 'ไม่มีคิวที่รออยู่แล้ววันนี้' : 'วันนี้ยังไม่มีคิว'"
        />

        <UiTextButton :to="`${BOOKINGS_PATH}?day=today`">
          ดูการจองวันนี้ทั้งหมด
        </UiTextButton>
      </template>
    </div>
  </div>
</template>
