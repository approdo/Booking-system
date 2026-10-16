<script setup lang="ts">
import type { DayHours } from '~/types/api'
import type { ThaiText } from '~/types/content'
import { addDays, DAY_OFF_WINDOW_DAYS, dayHoursError, hoursFieldMessages, isIsoDate } from '~/utils/bookingRules'
import { shortDateWithYear, weekdayName } from '~/utils/bookingFormat'
import { everyDay, hourChoices, isSameEveryDay, WEEK_ORDER, weekSummary } from '~/utils/openingHours'
import type { DayTimes } from '~/utils/openingHours'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// "ตั้งค่าร้าน" › "เวลาเปิดปิดร้าน" (spec section 7, design B): the regular opening hours, the same every day or
// day by day, saved with "บันทึก"; and special closed days, added and removed at once. The customer's times
// follow both in the same browser (BK-007 AC4). The sub-menu of "ตั้งค่าร้าน" appears when BK-010 adds its page
// (SETTINGS_PAGES in app/utils/adminNav.ts). noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'เวลาเปิดปิดร้าน') })

const { repository, leaveIfSignedOut } = useAdminSession()
const announce = useAnnounce()

const TIME_CHOICES = hourChoices().map(time => ({ value: time, label: time }))
const TIME_FIELDS = [
  { key: 'open', label: 'เปิด', spoken: 'เวลาเปิด' },
  { key: 'close', label: 'ปิด', spoken: 'เวลาปิด' },
  { key: 'lastBooking', label: 'คิวสุดท้าย', spoken: 'คิวสุดท้าย' },
] as const

const listState = ref<'loading' | 'ready' | 'failed'>('loading')
const loadFailure = ref<BannerContent | null>(null)
const today = ref('')

// ---- Regular hours ------------------------------------------------------------------------------

/** Seven days, Sunday first, as the API keeps them. */
const hours = ref<DayHours[]>([])
const sameEveryDay = ref(true)
const shared = reactive<DayTimes>({ open: '10:00', close: '22:00', lastBooking: '20:30' })
/** An error per row: 'all' for the one row of "ใช้เวลาเดียวกันทุกวัน", else the weekday. */
const rowErrors = ref<Record<string, string>>({})
const savingHours = ref(false)
const hoursFailure = ref<BannerContent | null>(null)
/** The hours as last saved, to show "บันทึกเวลาร้านแล้ว" until something changes. */
const savedHours = ref<string | null>(null)

/** What "บันทึก" sends. */
const hoursToSave = computed<DayHours[]>(() => (sameEveryDay.value ? everyDay(shared) : hours.value))
const summary = computed(() => weekSummary(hoursToSave.value))
const showSaved = computed(() => savedHours.value !== null && savedHours.value === JSON.stringify(hoursToSave.value))
const weekRows = computed(() => WEEK_ORDER.map(weekday => hours.value.find(day => day.weekday === weekday)).filter(day => day !== undefined))

function showHours(days: readonly DayHours[]) {
  hours.value = [...days].sort((a, b) => a.weekday - b.weekday).map(day => ({ ...day }))
  sameEveryDay.value = isSameEveryDay(hours.value)
  const firstOpen = WEEK_ORDER.map(weekday => hours.value.find(day => day.weekday === weekday)).find(day => day && !day.closed)
  if (firstOpen) Object.assign(shared, { open: firstOpen.open, close: firstOpen.close, lastBooking: firstOpen.lastBooking })
}

/**
 * "ใช้เวลาเดียวกันทุกวัน": on, one row of times for the whole week (it starts with the first open day's times);
 * off, seven rows that start with the times of that one row.
 */
function setSameEveryDay(same: boolean) {
  rowErrors.value = {}
  if (same) showHours(hours.value)
  else hours.value = everyDay(shared)
  sameEveryDay.value = same
}

async function saveHours() {
  if (savingHours.value) return
  hoursFailure.value = null
  const days = hoursToSave.value
  const errors: Record<string, string> = {}
  for (const day of days) {
    const error = dayHoursError(day)
    if (error) errors[sameEveryDay.value ? 'all' : String(day.weekday)] = hoursFieldMessages[error]
  }
  rowErrors.value = errors
  const rowKeys = sameEveryDay.value ? ['all'] : WEEK_ORDER.map(String)
  const firstBad = rowKeys.find(key => errors[key])
  if (firstBad) {
    announce(firstBad === 'all' ? `${errors[firstBad]}` : `วัน${weekdayName(Number(firstBad))}: ${errors[firstBad]}`)
    nextTick(() => document.querySelector<HTMLElement>(`#hours-${firstBad}-open`)?.focus())
    return
  }

  savingHours.value = true
  const result = await repository.updateHours(days.map(day => ({ ...day })))
  savingHours.value = false
  if (result.ok) {
    hours.value = result.data.hours.map(day => ({ ...day }))
    savedHours.value = JSON.stringify(hoursToSave.value)
    announce('บันทึกเวลาร้านแล้ว')
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  hoursFailure.value = bannerFor(result.state)
}

// ---- Special closed days ------------------------------------------------------------------------

const closedDates = ref<string[]>([])
const adding = ref(false)
const newDate = ref('')
const dateError = ref<ThaiText | null>(null)
const savingDate = ref<string | null>(null)
const datesFailure = ref<BannerContent | null>(null)
const addButton = ref<{ focus: () => void } | null>(null)
const dateField = ref<{ focus: () => void } | null>(null)

const lastDayOff = computed(() => (today.value ? addDays(today.value, DAY_OFF_WINDOW_DAYS - 1) : undefined))
const RANGE_MESSAGE: ThaiText = ['เลือกได้ตั้งแต่วันนี้', 'ถึงอีก 60 วัน']

function startAdding() {
  adding.value = true
  newDate.value = ''
  dateError.value = null
  nextTick(() => dateField.value?.focus())
}

async function addDate() {
  if (savingDate.value) return
  datesFailure.value = null
  const date = newDate.value
  if (!isIsoDate(date)) dateError.value = 'กรุณาเลือกวันที่'
  else if (date < today.value || (lastDayOff.value && date > lastDayOff.value)) dateError.value = RANGE_MESSAGE
  else dateError.value = null
  if (dateError.value) {
    dateField.value?.focus()
    return
  }

  savingDate.value = date
  const result = await repository.addClosedDate(date)
  savingDate.value = null
  if (result.ok) {
    closedDates.value = result.data.closedDates
    adding.value = false
    announce(`เพิ่มวันหยุด ${shortDateWithYear(date)} แล้ว`)
    nextTick(() => addButton.value?.focus())
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  if (result.state === 'invalid_input') {
    dateError.value = result.fields?.date === 'out_of_range' ? RANGE_MESSAGE : 'กรุณาเลือกวันที่'
    return
  }
  datesFailure.value = bannerFor(result.state)
}

async function removeDate(date: string) {
  if (savingDate.value) return
  datesFailure.value = null
  savingDate.value = date
  const result = await repository.removeClosedDate(date)
  savingDate.value = null
  if (result.ok) {
    closedDates.value = result.data.closedDates
    announce(`ลบวันหยุด ${shortDateWithYear(date)} แล้ว`)
    nextTick(() => addButton.value?.focus())
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  datesFailure.value = bannerFor(result.state)
}

// ---- Loading ------------------------------------------------------------------------------------

async function loadShop() {
  listState.value = 'loading'
  const result = await repository.getAdminShop()
  if (result.ok) {
    today.value = result.data.today
    showHours(result.data.hours)
    closedDates.value = result.data.closedDates
    listState.value = 'ready'
    loadFailure.value = null
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  listState.value = 'failed'
  loadFailure.value = bannerFor(result.state)
}

onMounted(loadShop)
</script>

<template>
  <div class="page-container">
    <div class="max-w-[720px]">
      <AdminPageHead
        title="ตั้งค่าร้าน"
        :detail="['เวลาเปิดปิดร้าน ', '· ลูกค้าเลือกเวลาได้', 'เฉพาะช่วงที่ร้านเปิด']"
      />

      <UiLoading v-if="listState === 'loading'">
        <div class="skeleton h-[230px] rounded-card" />
        <div class="skeleton mt-3 h-[150px] rounded-card" />
      </UiLoading>
      <UiStatusBanner
        v-else-if="listState === 'failed' && loadFailure"
        :variant="loadFailure.variant"
        :title="loadFailure.title"
        :text="loadFailure.text"
        :retry="loadFailure.retry"
        @retry="loadShop"
      />
      <template v-else>
        <form
          id="hours-form"
          method="dialog"
          novalidate
          aria-labelledby="regular-hours-title"
          class="rounded-card border border-line bg-card px-[18px] py-4"
          @submit.prevent="saveHours"
        >
          <h2
            id="regular-hours-title"
            class="text-[19px]"
          >
            เวลาปกติ
          </h2>
          <UiSwitch
            id="hours-same-every-day"
            :model-value="sameEveryDay"
            label="ใช้เวลาเดียวกันทุกวัน"
            @update:model-value="setSameEveryDay"
          />

          <div
            v-if="sameEveryDay"
            class="mt-2"
          >
            <div class="grid grid-cols-3 gap-2">
              <UiSelect
                v-for="field in TIME_FIELDS"
                :id="`hours-all-${field.key}`"
                :key="field.key"
                v-model="shared[field.key]"
                compact
                :options="TIME_CHOICES"
              >
                <template #label>
                  <span class="sr-only">ทุกวัน </span>{{ field.label }}<span class="sr-only">{{ field.spoken === field.label ? '' : ` (${field.spoken})` }}</span>
                </template>
              </UiSelect>
            </div>
            <p
              v-if="rowErrors.all"
              class="mt-1.5 flex items-start gap-1.5 text-[14px] leading-normal text-danger"
            >
              <UiIcon
                name="err"
                :size="18"
                class="mt-px"
              />{{ rowErrors.all }}
            </p>
          </div>

          <ul
            v-else
            role="list"
            class="mt-1"
          >
            <li
              v-for="day in weekRows"
              :key="day.weekday"
              class="border-t border-dashed border-line py-2.5"
            >
              <div class="flex flex-wrap items-center justify-between gap-x-3">
                <p class="text-[15px] font-semibold">
                  {{ weekdayName(day.weekday) }}
                </p>
                <UiSwitch
                  :id="`hours-${day.weekday}-switch`"
                  :model-value="!day.closed"
                  label="เปิด"
                  :hidden-label="`วัน${weekdayName(day.weekday)}`"
                  @update:model-value="(open: boolean) => { day.closed = !open }"
                />
              </div>
              <div
                v-if="!day.closed"
                class="mt-1 grid grid-cols-3 gap-2"
              >
                <UiSelect
                  v-for="field in TIME_FIELDS"
                  :id="`hours-${day.weekday}-${field.key}`"
                  :key="field.key"
                  v-model="day[field.key]"
                  compact
                  :options="TIME_CHOICES"
                >
                  <template #label>
                    <span class="sr-only">วัน{{ weekdayName(day.weekday) }} </span>{{ field.label }}<span class="sr-only">{{ field.spoken === field.label ? '' : ` (${field.spoken})` }}</span>
                  </template>
                </UiSelect>
              </div>
              <p
                v-else
                class="text-[14px] text-text-muted"
              >
                ปิดทั้งวัน
              </p>
              <p
                v-if="rowErrors[day.weekday]"
                class="mt-1.5 flex items-start gap-1.5 text-[14px] leading-normal text-danger"
              >
                <UiIcon
                  name="err"
                  :size="18"
                  class="mt-px"
                />{{ rowErrors[day.weekday] }}
              </p>
            </li>
          </ul>

          <ul
            role="list"
            aria-label="สรุปเวลาเปิดปิด"
            class="mt-3 border-t border-dashed border-line pt-2 text-[15px] text-text-muted"
          >
            <li
              v-for="line in summary"
              :key="line"
            >
              {{ line }}
            </li>
          </ul>
        </form>

        <section
          aria-labelledby="closed-days-title"
          class="mt-3 rounded-card border border-line bg-card px-[18px] py-4"
        >
          <h2
            id="closed-days-title"
            class="mb-1.5 text-[19px]"
          >
            วันหยุดพิเศษ
          </h2>
          <UiStatusBanner
            v-if="datesFailure"
            class="mb-2"
            focus-on-mount
            :variant="datesFailure.variant"
            :title="datesFailure.title"
            :text="datesFailure.text"
            :retry="datesFailure.retry"
            @retry="adding ? addDate() : loadShop()"
          />
          <ul
            v-if="closedDates.length > 0"
            role="list"
          >
            <li
              v-for="date in closedDates"
              :key="date"
              class="flex items-center justify-between gap-2.5 border-t border-dashed border-line text-[15px] first:border-t-0"
            >
              <span><span class="whitespace-nowrap">{{ shortDateWithYear(date) }}</span> · ปิดทั้งวัน</span>
              <UiTextButton
                :busy="savingDate === date"
                busy-label="กำลังลบ…"
                :disabled="savingDate !== null && savingDate !== date"
                @click="removeDate(date)"
              >
                ลบ<span class="sr-only">{{ ` ${shortDateWithYear(date)}` }}</span>
              </UiTextButton>
            </li>
          </ul>
          <p
            v-else
            class="text-[15px] text-text-muted"
          >
            ยังไม่มีวันหยุดพิเศษ
          </p>

          <form
            v-if="adding"
            id="closed-date-form"
            method="dialog"
            novalidate
            class="mt-3 grid max-w-[320px] justify-items-start gap-2"
            @submit.prevent="addDate"
          >
            <UiTextField
              id="closed-date"
              ref="dateField"
              v-model="newDate"
              class="w-full"
              type="date"
              label="วันที่"
              :min="today"
              :max="lastDayOff"
              :error="dateError"
            />
            <UiButton
              type="submit"
              size="sm"
              :busy="savingDate === newDate && savingDate !== null"
              busy-label="กำลังบันทึก…"
            >
              เพิ่ม
            </UiButton>
          </form>
          <UiTextButton
            v-else
            ref="addButton"
            class="-ml-2"
            icon="plus"
            :disabled="savingDate !== null"
            @click="startAdding"
          >
            เพิ่มวันหยุด
          </UiTextButton>
        </section>

        <div class="mt-5 grid gap-3">
          <UiStatusBanner
            v-if="hoursFailure"
            focus-on-mount
            :variant="hoursFailure.variant"
            :title="hoursFailure.title"
            :text="hoursFailure.text"
            :retry="hoursFailure.retry"
            @retry="saveHours"
          />
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <UiButton
              type="submit"
              form="hours-form"
              :busy="savingHours"
              busy-label="กำลังบันทึก…"
            >
              บันทึก
            </UiButton>
            <p
              v-if="showSaved"
              class="flex items-center gap-1.5 text-[14px] font-semibold text-success"
            >
              <UiIcon name="check" />บันทึกเวลาร้านแล้ว
            </p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
