<script setup lang="ts">
import type { Shop } from '~/types/api'
import type { ThaiText } from '~/types/content'
import { addDays, isIsoDate } from '~/utils/bookingRules'
import { fullDate } from '~/utils/bookingFormat'
import {
  bookingsOn,
  calendarColumns,
  columnKeyOf,
  gridRange,
  hourMarks,
  isDayOff,
  placeBookings,
  rangeHeight,
  UNASSIGNED,
} from '~/utils/calendarDay'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'
import { hoursOn } from '~/utils/todaySummary'

// "ปฏิทิน" (spec section 7, BK-009; design B): the bookings of one day by time. From 1024px a grid with a column
// per therapist (and "ยังไม่จัดคน"), rows of 30 minutes from opening to closing time and a therapist's day off
// striped; narrower, the same bookings as a list with a filter per therapist. The day is in the URL
// (?date=YYYY-MM-DD, none for today) and moves a day at a time, past days included. Pressing a booking opens
// its card in a dialog, where its status can be changed. noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'ปฏิทิน') })

const ALL_THERAPISTS = 'all'

const router = useRouter()
const announce = useAnnounce()
const { repository, leaveIfSignedOut } = useAdminSession()
const { list, load } = useAdminBookings()

/** loading: on its way · ready: shown · failed: it could not be read (a banner takes its place). */
const state = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<BannerContent | null>(null)
const shop = ref<Shop | null>(null)

/**
 * The day asked for in the URL; null = today. Read once the page runs in the browser (onMounted): while the
 * pre-rendered page comes to life its route has no query yet (lesson L-010).
 */
const requestedDate = ref<string | null>(null)
/** The filter of the list below 1024px: every therapist, or one. */
const therapistFilter = ref(ALL_THERAPISTS)

/** The bookings (shared with the booking list and the tab bar) and the shop's hours and therapists, together. */
async function loadCalendar() {
  state.value = 'loading'
  const [bookings, shopResult] = await Promise.all([load(), repository.getAdminShop()])
  if (bookings.ok && shopResult.ok) {
    shop.value = shopResult.data
    state.value = 'ready'
    failure.value = null
    return
  }
  const failed = !bookings.ok ? bookings.state : !shopResult.ok ? shopResult.state : 'unavailable'
  if (await leaveIfSignedOut(failed)) return
  state.value = 'failed'
  failure.value = bannerFor(failed)
}

onSignedInMounted(() => {
  const { date } = router.currentRoute.value.query
  requestedDate.value = typeof date === 'string' && isIsoDate(date) ? date : null
  loadCalendar()
})

/** "Today" comes from the API, like on the other pages, so the days agree everywhere. */
const today = computed(() => list.value?.today ?? null)
const date = computed(() => requestedDate.value ?? today.value)

/** Shows another day: keeps it in the URL (none for today) and says the new day to screen readers. */
function goTo(day: string) {
  requestedDate.value = day === today.value ? null : day
  const { query } = router.currentRoute.value
  router.replace({ query: { ...query, date: requestedDate.value ?? undefined } })
  announce(fullDate(day))
}

function moveBy(days: number) {
  if (date.value) goTo(addDays(date.value, days))
}

function goToToday() {
  if (today.value) goTo(today.value)
}

const therapists = computed(() => shop.value?.therapists ?? [])
const dayBookings = computed(() => (list.value && date.value ? bookingsOn(list.value.bookings, date.value) : []))
const hours = computed(() => (shop.value && date.value ? hoursOn(date.value, shop.value.hours, shop.value.closedDates) : null))
const range = computed(() => (hours.value ? gridRange(hours.value, dayBookings.value) : null))
const height = computed(() => (range.value ? `${rangeHeight(range.value)}px` : '0px'))
const marks = computed(() => (range.value ? hourMarks(range.value) : []))

/** 'เสาร์ 17 ตุลาคม 2569 · ร้านเปิด 10:00–22:00 น.', or '… · ร้านปิด'. */
const detail = computed<ThaiText | null>(() => {
  if (state.value !== 'ready' || !date.value || !hours.value) return null
  const day = `${fullDate(date.value)} · `
  return hours.value.closed ? [day, 'ร้านปิด'] : [day, 'ร้านเปิด ', `${hours.value.open}–${hours.value.close} น.`]
})

/** The grid (1024px and wider): each column with its bookings placed, and whether the therapist is off. */
const columns = computed(() => {
  const day = date.value
  const shown = range.value
  if (!day || !shown) return []
  return calendarColumns(therapists.value).map(column => ({
    ...column,
    off: column.therapist ? isDayOff(column.therapist, day) : false,
    placed: placeBookings(dayBookings.value.filter(booking => columnKeyOf(booking, therapists.value) === column.key), shown),
  }))
})
const gridColumns = computed(() => ({ gridTemplateColumns: `56px repeat(${columns.value.length}, minmax(0, 1fr))` }))

/** The list (narrower): the day's bookings, of one therapist when the filter says so. */
const therapistOptions = computed(() => [
  { value: ALL_THERAPISTS, label: 'ทุกคน' },
  ...therapists.value.map(person => ({ value: person.id, label: person.name })),
])
const listed = computed(() => (therapistFilter.value === ALL_THERAPISTS
  ? dayBookings.value
  : dayBookings.value.filter(booking => booking.therapistId === therapistFilter.value)))
/** The therapists who do not work that day (the grid stripes their columns; the list says it in a line). */
const offNames = computed(() => (date.value
  ? therapists.value
      .filter(person => (therapistFilter.value === ALL_THERAPISTS || person.id === therapistFilter.value) && isDayOff(person, date.value!))
      .map(person => person.name)
  : []))

function therapistName(therapistId: string | null): string {
  return therapists.value.find(person => person.id === therapistId)?.name ?? 'ยังไม่จัดคน'
}

/** The booking whose card is open in the dialog: read from the shared list, so a change shows at once. */
const openCode = ref<string | null>(null)
const opened = computed(() => list.value?.bookings.find(booking => booking.code === openCode.value) ?? null)
const dialog = ref<{ open: () => void } | null>(null)

async function openBooking(code: string) {
  openCode.value = code
  await nextTick()
  dialog.value?.open()
}
</script>

<template>
  <div class="page-container">
    <AdminPageHead
      title="ปฏิทิน"
      :detail="detail"
    >
      <div class="flex gap-2">
        <UiIconButton
          icon="left"
          label="วันก่อน"
          :disabled="!date"
          @click="moveBy(-1)"
        />
        <UiButton
          variant="outline"
          size="sm"
          :disabled="!today"
          @click="goToToday"
        >
          วันนี้
        </UiButton>
        <UiIconButton
          icon="right"
          label="วันถัดไป"
          :disabled="!date"
          @click="moveBy(1)"
        />
      </div>
    </AdminPageHead>

    <UiLoading v-if="state === 'loading'">
      <div class="lg:hidden">
        <div class="skeleton mb-3 h-11 rounded-button" />
        <div
          v-for="placeholder in 3"
          :key="placeholder"
          class="skeleton mb-2.5 h-[52px] rounded-[10px]"
        />
      </div>
      <div class="skeleton hidden h-[640px] rounded-card lg:block" />
    </UiLoading>
    <UiStatusBanner
      v-else-if="state === 'failed' && failure"
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="loadCalendar"
    />
    <UiEmptyState
      v-else-if="dayBookings.length === 0"
      text="ไม่มีการจองในวันนี้"
    />
    <template v-else>
      <!-- Narrower than 1024px: a list, with a filter per therapist (spec sections 7 and 8). -->
      <div class="lg:hidden">
        <UiFilterChips
          v-model="therapistFilter"
          label="หมอนวด"
          :options="therapistOptions"
        />
        <p
          v-if="offNames.length > 0"
          class="mt-2.5 text-[14px] text-text-muted"
        >
          หมอนวดที่หยุด: {{ offNames.join(', ') }}
        </p>
        <ol
          v-if="listed.length > 0"
          role="list"
          aria-label="การจองตามเวลา"
          class="mt-3 grid gap-2.5"
        >
          <li
            v-for="booking in listed"
            :key="booking.code"
          >
            <AdminCalendarEvent
              :booking="booking"
              placement="list"
              :therapist-name="therapistName(booking.therapistId)"
              @open="openBooking(booking.code)"
            />
          </li>
        </ol>
        <UiEmptyState
          v-else
          text="ไม่มีการจองในวันนี้"
        />
      </div>

      <!-- From 1024px: a column per therapist, rows of 30 minutes (spec section 7). -->
      <div
        class="hidden gap-x-2 rounded-card border border-line bg-card px-3.5 pt-2.5 pb-3.5 lg:grid"
        :style="gridColumns"
      >
        <div aria-hidden="true">
          <div class="h-16" />
          <div
            class="relative"
            :style="{ height }"
          >
            <span
              v-for="mark in marks"
              :key="mark.time"
              :data-time="mark.time"
              class="absolute inset-x-0 border-t border-line text-[13px] leading-[1.35] text-text-muted"
              :style="{ top: `${mark.top}px` }"
            >{{ mark.time }}</span>
          </div>
        </div>
        <section
          v-for="column in columns"
          :key="column.key"
          :data-column="column.key"
          :aria-labelledby="`column-${column.key}`"
          class="min-w-0"
        >
          <h2
            :id="`column-${column.key}`"
            class="grid h-16 content-center justify-items-center gap-0.5 font-body text-[14px] leading-[1.3] font-semibold"
          >
            <UiAvatar
              :initial="column.therapist?.initial"
              :any="column.key === UNASSIGNED"
              :size="28"
            />
            <span class="max-w-full truncate">{{ column.label }}</span>
          </h2>
          <div
            class="calendar-hours relative"
            :style="{ height }"
          >
            <p
              v-if="column.off"
              class="calendar-day-off absolute inset-0 rounded-[10px] px-2 py-1 text-[13px] text-text-muted"
            >
              หยุด
            </p>
            <ol role="list">
              <li
                v-for="item in column.placed"
                :key="item.booking.code"
              >
                <AdminCalendarEvent
                  :booking="item.booking"
                  placement="grid"
                  class="absolute"
                  :style="{
                    top: `${item.top + 1}px`,
                    height: `${item.height - 2}px`,
                    left: `calc(${item.lane} * 100% / ${item.lanes})`,
                    width: `calc(100% / ${item.lanes} - 2px)`,
                  }"
                  @open="openBooking(item.booking.code)"
                />
              </li>
            </ol>
          </div>
        </section>
      </div>
    </template>

    <UiDialog
      id="calendar-booking"
      ref="dialog"
      title="รายละเอียดการจอง"
      @close="openCode = null"
    >
      <ul
        v-if="opened"
        role="list"
      >
        <AdminBookingCard :booking="opened" />
      </ul>
    </UiDialog>
  </div>
</template>
