<script setup lang="ts">
import { seed } from '~/data/seed'
import {
  ANY_THERAPIST,
  bookingsInRange,
  DAY_FILTERS,
  DEFAULT_FILTERS,
  filterBookings,
  groupByDay,
  NO_PREFERENCE,
  readDayFilter,
  readStatusFilter,
  STATUS_FILTERS,
  statusCounts,
} from '~/utils/bookingFilters'
import type { DayFilter, StatusFilter } from '~/utils/bookingFilters'
import { addDays } from '~/utils/bookingRules'
import { dayWithMonth } from '~/utils/bookingFormat'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// "การจอง" (spec section 7, design B): every booking of the visitor's sandbox as cards, day by day, with a search
// box and filters. The list comes from the API once and is filtered here, in the browser; the day and status
// filters are kept in the URL (?day=today&status=pending), the search words are not. noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'การจอง') })

const router = useRouter()
const { leaveIfSignedOut } = useAdminSession()
const { list, load } = useAdminBookings()

// The filters of the URL are read once the page runs in the browser (onMounted): the pre-rendered page has no
// query, and while it comes to life its route is still that of the pre-rendered page.
const day = ref<DayFilter>('all')
const status = ref<StatusFilter>('all')
const therapist = ref(ANY_THERAPIST)
/** What is in the search box, and the search itself, 200 ms after the last key. */
const searchText = ref('')
const search = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(searchText, (text) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = text
  }, 200)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

/** Cards whose status was just changed stay in the list until a filter changes (spec section 3, BookingCard). */
const kept = ref(new Set<string>())

watch([day, status, therapist, search], () => {
  kept.value = new Set()
})
watch([day, status], ([dayValue, statusValue]) => {
  const { query } = router.currentRoute.value
  router.replace({ query: { ...query, day: dayValue === 'all' ? undefined : dayValue, status: statusValue === 'all' ? undefined : statusValue } })
})

/** loading: the list is on its way · ready: shown · failed: it could not be read (a banner takes its place). */
const listState = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<BannerContent | null>(null)

async function loadList() {
  listState.value = 'loading'
  const result = await load()
  if (result.ok) {
    listState.value = 'ready'
    failure.value = null
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  listState.value = 'failed'
  failure.value = bannerFor(result.state)
}

onSignedInMounted(() => {
  const { query } = router.currentRoute.value
  day.value = readDayFilter(query.day)
  status.value = readStatusFilter(query.status)
  loadList()
})

const filters = computed(() => ({ day: day.value, status: status.value, therapist: therapist.value, search: search.value }))
const today = computed(() => list.value?.today ?? null)
const shown = computed(() => (list.value ? filterBookings(list.value.bookings, filters.value, list.value.today, kept.value) : []))
const days = computed(() => groupByDay(shown.value))
const counts = computed(() => (list.value ? statusCounts(list.value.bookings, filters.value, list.value.today) : null))
const noneInRange = computed(() => (list.value ? bookingsInRange(list.value.bookings, day.value, list.value.today).length === 0 : false))

const statusOptions = computed(() => STATUS_FILTERS.map(filter => ({ ...filter, count: counts.value?.[filter.value] ?? null })))
const therapistOptions = [
  { value: ANY_THERAPIST, label: 'หมอนวด: ทุกคน' },
  ...seed.therapists.map(person => ({ value: person.id, label: person.name })),
  { value: NO_PREFERENCE, label: 'ไม่ระบุ' },
]

/** 'วันนี้ · เสาร์ 17 ต.ค.', 'พรุ่งนี้ · อาทิตย์ 18 ต.ค.', then 'จันทร์ 19 ต.ค.'. */
function dayHeading(date: string) {
  if (date === today.value) return `วันนี้ · ${dayWithMonth(date)}`
  if (today.value && date === addDays(today.value, 1)) return `พรุ่งนี้ · ${dayWithMonth(date)}`
  return dayWithMonth(date)
}

function clearFilters() {
  day.value = DEFAULT_FILTERS.day
  status.value = DEFAULT_FILTERS.status
  therapist.value = DEFAULT_FILTERS.therapist
  searchText.value = ''
  search.value = ''
}

function keep(code: string) {
  kept.value = new Set([...kept.value, code])
}
</script>

<template>
  <div class="page-container">
    <AdminPageHead
      title="การจอง"
      :detail="listState === 'ready' ? `${shown.length} รายการ` : null"
    />

    <div
      role="search"
      class="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div class="relative">
        <label
          for="booking-search"
          class="sr-only"
        >ค้นหา</label>
        <UiIcon
          name="search"
          class="pointer-events-none absolute top-3.5 left-3.5 text-text-muted"
        />
        <input
          id="booking-search"
          v-model="searchText"
          type="search"
          autocomplete="off"
          placeholder="ค้นหาชื่อ เบอร์ หรือเลขจอง"
          class="min-h-12 w-full rounded-input border border-text-muted bg-white pr-3.5 pl-11 text-[16px] text-text transition-[color,background-color,border-color] placeholder:text-text-muted hover:border-text focus-visible:border-accent"
        >
      </div>
      <UiFilterChips
        v-model="day"
        label="ช่วงวัน"
        :options="DAY_FILTERS"
      />
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2.5 md:col-span-full">
        <UiFilterChips
          v-model="status"
          label="สถานะ"
          :options="statusOptions"
        />
        <UiSelect
          id="booking-therapist"
          v-model="therapist"
          label="หมอนวด"
          hide-label
          class="min-w-[170px]"
          :options="therapistOptions"
        />
      </div>
    </div>

    <UiLoading v-if="listState === 'loading'">
      <div class="mt-[18px] mb-2.5 h-[25px]" />
      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="placeholder in 3"
          :key="placeholder"
          class="skeleton h-[184px] rounded-card"
        />
      </div>
    </UiLoading>
    <UiStatusBanner
      v-else-if="listState === 'failed' && failure"
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="loadList"
    />
    <UiEmptyState
      v-else-if="noneInRange"
      text="ยังไม่มีการจองในช่วงนี้"
    />
    <UiEmptyState
      v-else-if="days.length === 0"
      text="ไม่พบการจองที่ตรงกับตัวกรอง"
    >
      <UiTextButton @click="clearFilters">
        ล้างตัวกรอง
      </UiTextButton>
    </UiEmptyState>
    <template v-else>
      <section
        v-for="group in days"
        :key="group.date"
        :aria-labelledby="`day-${group.date}`"
      >
        <h2
          :id="`day-${group.date}`"
          class="mt-[18px] mb-2.5 flex flex-wrap items-baseline gap-x-2.5 text-[18px] leading-[1.4]"
        >
          <span class="whitespace-nowrap">{{ dayHeading(group.date) }}</span>
          <span class="font-body text-[14px] font-normal text-text-muted">{{ group.bookings.length }} คิว</span>
        </h2>
        <ul
          role="list"
          class="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          <AdminBookingCard
            v-for="booking in group.bookings"
            :key="booking.code"
            :booking="booking"
            @changed="keep"
          />
        </ul>
      </section>
    </template>
  </div>
</template>
