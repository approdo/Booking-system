<script setup lang="ts">
import type { AvailabilityResponse, DayAvailability, Slot } from '~/types/api'
import type { ThaiText } from '~/types/content'
import { withDate, withTherapist } from '~/utils/bookingDraft'
import {
  DAY_PERIOD_NAMES,
  dayOfMonth,
  dayPeriod,
  dayWithMonth,
  monthHeading,
  shortDate,
  shortWeekday,
  spokenDate,
  thaiToday,
  timeRange,
} from '~/utils/bookingFormat'
import type { DayPeriod } from '~/utils/bookingFormat'
import { addDays } from '~/utils/bookingRules'
import { bannerFor, slotTakenBanner, stateBanners } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// Step 3, "choose a day and a time" (spec section 6): the next 14 days in two weeks of seven, then the free
// start times of the chosen day, by part of the day. Only times that are really free are offered, so the
// screen asks the API (GET /api/availability); reading never writes (D-008 ข). The first free day is chosen
// on arrival. A time that was taken while the visitor filled in the form brings them back here (screen 4).
const heading = ref<HTMLElement | null>(null)
const { draft, ready, save } = useBookingStep(3, heading)
const repository = useBookingRepository()

const DAYS_PER_WEEK = 7
const PERIODS: readonly DayPeriod[] = ['morning', 'afternoon', 'evening']
const DAY_WORDS = { available: 'ว่าง', full: 'เต็ม', closed: 'หยุด' } as const

const availability = ref<AvailabilityResponse | null>(null)
const loadState = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<BannerContent | null>(null)
const expired = ref(false)
const week = ref(0)
/** Today in Thai time, known once the page runs in the browser (the skeleton's day numbers). */
const today = ref<string | null>(null)

/** Set by screen 4 when the chosen time was taken meanwhile (spec section 5, slot_taken). */
const flash = useState<'slot_taken' | null>('booking:flash', () => null)
const slotTaken = ref(false)

const days = computed(() => availability.value?.days ?? [])
const weekDays = computed(() => days.value.slice(week.value * DAYS_PER_WEEK, (week.value + 1) * DAYS_PER_WEEK))
const weekCount = computed(() => Math.max(1, Math.ceil(days.value.length / DAYS_PER_WEEK)))
const chosenDay = computed(() => days.value.find(day => day.date === draft.value.date) ?? null)
const hasFreeDay = computed(() => days.value.some(day => day.status === 'available'))
const skeletonDays = computed(() => (today.value ? Array.from({ length: DAYS_PER_WEEK }, (_, index) => addDays(today.value!, index)) : []))

const groups = computed(() => {
  const slots = chosenDay.value?.slots ?? []
  return PERIODS
    .map(period => ({ period, slots: slots.filter(slot => dayPeriod(slot.time) === period) }))
    .filter(group => group.slots.length > 0)
})

const therapistName = computed(() => draft.value.therapist?.name ?? '')
const choseSomeone = computed(() => draft.value.therapist?.id !== null && draft.value.therapist !== undefined)

const lead = computed<ThaiText>(() => {
  const { service } = draft.value
  const who = choseSomeone.value ? therapistName.value : 'มีหมอนวด'
  return ['แสดงเฉพาะเวลา', `ที่${who}ว่าง`, 'สำหรับ ', `${service?.name ?? ''} `, `${service?.minutes ?? ''} นาที`]
})

/** "อยากได้เวลาว่างมากขึ้น …" for a chosen therapist, and the day's last booking time. */
const hint = computed<ThaiText | null>(() => {
  const last = chosenDay.value?.lastBooking
  const lastPhrases = last ? ['รับคิวสุดท้าย ', `${last} น.`] : []
  if (!choseSomeone.value) return lastPhrases.length > 0 ? lastPhrases : null
  const tip = ['อยากได้เวลาว่างมากขึ้น ', `ลองเปลี่ยนหมอนวดเป็น “ไม่ระบุ”${last ? ' ' : ''}`]
  return last ? [...tip, `· ${lastPhrases[0]}`, lastPhrases[1]!] : tip
})

function dayLabel(day: DayAvailability) {
  return `${day.date === availability.value?.today ? 'วันนี้ ' : ''}${spokenDate(day.date)} ${DAY_WORDS[day.status]}`
}

function slotLabel(slot: Slot) {
  return slot.available ? `${slot.time} ถึง ${slot.end}` : `${slot.time} เต็ม`
}

function showWeekOf(date: string) {
  const index = days.value.findIndex(day => day.date === date)
  if (index >= 0) week.value = Math.floor(index / DAYS_PER_WEEK)
}

/** Keeps the chosen day if it is still free, else takes the first free one; a time no longer free is dropped. */
function pickDay() {
  const free = days.value.filter(day => day.status === 'available')
  const day = free.find(item => item.date === draft.value.date) ?? free[0]
  if (!day) {
    save({ ...draft.value, date: undefined, time: undefined })
    return
  }
  let next = withDate(draft.value, day.date)
  const time = next.time
  if (time && !day.slots.some(slot => slot.available && slot.time === time.start && slot.end === time.end)) next = { ...next, time: undefined }
  save(next)
  showWeekOf(day.date)
}

async function loadTimes(): Promise<void> {
  const { service, therapist } = draft.value
  if (!service || !therapist) return
  loadState.value = 'loading'
  const result = await repository.getAvailability(service.minutes, therapist.id)
  if (result.ok) {
    availability.value = result.data
    failure.value = null
    loadState.value = 'ready'
    pickDay()
    return
  }
  if (result.state === 'sandbox_expired') {
    expired.value = true
    return loadTimes()
  }
  failure.value = bannerFor(result.state)
  loadState.value = 'failed'
}

function chooseDate(date: string) {
  slotTaken.value = false
  save(withDate(draft.value, date))
}

function chooseTime(slot: Slot) {
  slotTaken.value = false
  save({ ...draft.value, time: { start: slot.time, end: slot.end } })
}

function switchToAnyone() {
  save(withTherapist(draft.value, { id: null, name: 'ไม่ระบุ' }))
  loadTimes()
}

watch(ready, (isReady) => {
  if (!isReady) return
  if (flash.value === 'slot_taken') {
    slotTaken.value = true
    flash.value = null
  }
  loadTimes()
})

onMounted(() => {
  today.value = thaiToday()
})

const summary = computed<ThaiText>(() => {
  const { date, time } = draft.value
  return date && time ? [`${shortDate(date)} · `, timeRange(time.start, time.end)] : 'ยังไม่ได้เลือกเวลา'
})
</script>

<template>
  <div>
    <div class="mx-auto w-[min(100%-32px,760px)] pt-4 pb-9 md:pt-6">
      <UiTextButton
        to="/therapist/"
        icon="left"
        muted
      >
        ย้อนกลับ
      </UiTextButton>
      <h1
        ref="heading"
        tabindex="-1"
        class="mt-0.5 text-[clamp(28px,6vw,40px)]"
      >
        <PhraseText :text="['เลือกวัน', 'และเวลา']" />
      </h1>
      <p
        v-if="ready"
        class="mt-1.5 text-text-muted"
      >
        <PhraseText :text="lead" />
      </p>

      <UiStatusBanner
        v-if="slotTaken"
        class="mt-5"
        focus-on-mount
        v-bind="slotTakenBanner"
      />
      <UiStatusBanner
        v-if="expired"
        class="mt-5"
        v-bind="stateBanners.sandbox_expired"
      />

      <UiStatusBanner
        v-if="loadState === 'failed' && failure"
        class="mt-6"
        :variant="failure.variant"
        :title="failure.title"
        :text="failure.text"
        :retry="failure.retry"
        @retry="loadTimes"
      />

      <UiLoading
        v-else-if="loadState === 'loading'"
        class="mt-6"
      >
        <div class="mb-2.5 flex items-center justify-between gap-3">
          <div class="skeleton h-7 w-40 rounded-input" />
          <div class="flex gap-2">
            <div class="skeleton size-11 rounded-input" />
            <div class="skeleton size-11 rounded-input" />
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1.5">
          <div
            v-for="index in DAYS_PER_WEEK"
            :key="index"
            class="skeleton grid min-h-[78px] content-center justify-items-center gap-1 rounded-[14px] md:min-h-[84px]"
          >
            <span class="h-2.5 w-6 rounded-full bg-line" />
            <span class="text-[20px] leading-tight font-semibold text-text-muted">{{ skeletonDays[index - 1] ? dayOfMonth(skeletonDays[index - 1]!) : '' }}</span>
            <span class="h-2.5 w-6 rounded-full bg-line" />
          </div>
        </div>
        <div
          v-for="group in 3"
          :key="group"
          class="mt-6"
        >
          <div class="skeleton mb-2.5 h-5 w-24 rounded-full" />
          <div class="grid grid-cols-4 gap-2 md:grid-cols-6">
            <div
              v-for="slot in 8"
              :key="slot"
              class="skeleton h-[52px] rounded-input"
            />
          </div>
        </div>
      </UiLoading>

      <template v-else-if="loadState === 'ready'">
        <UiStatusBanner
          v-if="hint && hasFreeDay"
          class="mt-5"
          variant="info"
          :text="hint"
        />

        <UiEmptyState
          v-if="!hasFreeDay"
          class="mt-6"
          :text="['ไม่มีเวลาว่าง', 'ใน 14 วันข้างหน้า']"
        >
          <UiTextButton
            v-if="choseSomeone"
            class="mt-2"
            @click="switchToAnyone"
          >
            เปลี่ยนหมอนวดเป็น “ไม่ระบุ”
          </UiTextButton>
        </UiEmptyState>

        <template v-else>
          <div class="mt-6 mb-2.5 flex items-center justify-between gap-3">
            <h2 class="text-[20px]">
              {{ monthHeading(weekDays.map(day => day.date)) }}
            </h2>
            <div class="flex gap-2">
              <UiIconButton
                icon="left"
                label="สัปดาห์ก่อน"
                :disabled="week === 0"
                @click="week -= 1"
              />
              <UiIconButton
                icon="right"
                label="สัปดาห์ถัดไป"
                :disabled="week >= weekCount - 1"
                @click="week += 1"
              />
            </div>
          </div>
          <fieldset>
            <legend class="sr-only">
              วัน
            </legend>
            <ul
              role="list"
              class="grid grid-cols-7 gap-1.5"
            >
              <li
                v-for="day in weekDays"
                :key="day.date"
              >
                <label class="choice-tile min-h-[78px] content-center gap-0.5 rounded-[14px] px-0 py-1.5 leading-tight md:min-h-[84px]">
                  <input
                    type="radio"
                    name="date"
                    class="sr-only"
                    :value="day.date"
                    :checked="draft.date === day.date"
                    :disabled="day.status !== 'available'"
                    :aria-label="dayLabel(day)"
                    @change="chooseDate(day.date)"
                  >
                  <span class="tile-note text-[13px]">{{ day.date === availability?.today ? 'วันนี้' : shortWeekday(day.date) }}</span>
                  <span class="tile-struck text-[20px] font-semibold">{{ dayOfMonth(day.date) }}</span>
                  <span :class="['text-[13px]', day.status === 'available' ? 'tile-free' : 'tile-note']">{{ DAY_WORDS[day.status] }}</span>
                </label>
              </li>
            </ul>
          </fieldset>

          <fieldset
            v-if="chosenDay"
            class="mt-2"
          >
            <legend class="sr-only">
              เวลาของ{{ spokenDate(chosenDay.date) }}
            </legend>
            <section
              v-for="(group, index) in groups"
              :key="group.period"
              :aria-labelledby="`period-${group.period}`"
            >
              <h2
                :id="`period-${group.period}`"
                class="mt-6 mb-2.5 flex flex-wrap items-baseline gap-x-2 font-body text-[16px] leading-[1.4]"
              >
                {{ DAY_PERIOD_NAMES[group.period] }}
                <span
                  v-if="index === 0"
                  class="text-[14px] font-normal text-text-muted"
                >{{ dayWithMonth(chosenDay.date) }}</span>
              </h2>
              <ul
                role="list"
                class="grid grid-cols-4 gap-2 md:grid-cols-6"
              >
                <li
                  v-for="slot in group.slots"
                  :key="slot.time"
                >
                  <label class="choice-tile min-h-[52px] font-semibold leading-tight">
                    <input
                      type="radio"
                      name="time"
                      class="sr-only"
                      :value="slot.time"
                      :checked="draft.time?.start === slot.time"
                      :disabled="!slot.available"
                      :aria-label="slotLabel(slot)"
                      @change="chooseTime(slot)"
                    >
                    <span class="tile-struck">{{ slot.time }}</span>
                    <small
                      v-if="!slot.available"
                      class="tile-note text-[13px] font-normal"
                    >เต็ม</small>
                    <small
                      v-else-if="draft.time?.start === slot.time"
                      class="text-[13px] font-normal"
                    >ถึง {{ slot.end }}</small>
                  </label>
                </li>
              </ul>
            </section>
          </fieldset>

          <ul
            aria-hidden="true"
            class="mt-[18px] flex flex-wrap gap-x-[18px] gap-y-1 text-[14px] text-text-muted"
          >
            <li class="flex items-center gap-1.5">
              <span class="size-4 rounded-[5px] border-[1.5px] border-line bg-white" />ว่าง
            </li>
            <li class="flex items-center gap-1.5">
              <span class="size-4 rounded-[5px] bg-surface" />เต็ม / หยุด
            </li>
            <li class="flex items-center gap-1.5">
              <span class="size-4 rounded-[5px] bg-accent" />ที่เลือก
            </li>
          </ul>
        </template>
      </template>
    </div>

    <BookingActionBar
      v-if="ready && draft.service"
      :summary="summary"
      :price="draft.service.price"
      label="ถัดไป"
      icon="right"
      :blocked-reason="draft.date && draft.time ? null : 'เลือกวันและเวลาก่อน'"
      @next="navigateTo('/details/')"
    />
  </div>
</template>
