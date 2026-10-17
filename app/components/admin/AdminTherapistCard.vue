<script setup lang="ts">
import type { Therapist } from '~/types/api'
import type { ThaiText } from '~/types/content'
import { shortDateWithYear, shortWeekdayName, weekdayName } from '~/utils/bookingFormat'
import { addDays, DAY_OFF_WINDOW_DAYS, isIsoDate } from '~/utils/bookingRules'
import { WEEK_ORDER } from '~/utils/openingHours'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'
import { toggleWorkDay, workSummary } from '~/utils/therapistSchedule'

/**
 * One therapist in "ตารางงานหมอนวด" (spec section 7, BK-010): the letter avatar, the name and the regular week
 * in words, seven day buttons Monday to Sunday (DayToggle: dark = works, white = day off), and the leave dates.
 * Every control saves at once (spec section 7, "กติกาบันทึก"); the customer's days and times follow in the
 * same browser, because the Worker only offers a therapist on the days they work (worker/src/core/availability.ts).
 */
const props = defineProps<{ therapist: Therapist, today: string }>()
const emit = defineEmits<{ updated: [therapist: Therapist] }>()

const { repository, leaveIfSignedOut } = useAdminSession()
const announce = useAnnounce()

const failure = ref<BannerContent | null>(null)
/** What "ลองใหม่" in the failure box sends again. */
let retry: (() => void) | null = null

function fail(content: BannerContent, again: () => void) {
  retry = again
  failure.value = content
}

function retryLast() {
  retry?.()
}

// ---- Working days -------------------------------------------------------------------------------

/** The days shown while a change is being saved: a button changes at once, and changes back if it fails. */
const changingDays = ref<number[] | null>(null)
const workDays = computed(() => changingDays.value ?? props.therapist.workDays)
const summary = computed(() => workSummary({ workDays: workDays.value }))

async function toggleDay(weekday: number) {
  if (changingDays.value) return
  failure.value = null
  const days = toggleWorkDay(props.therapist.workDays, weekday)
  changingDays.value = days
  const result = await repository.updateWorkDays(props.therapist.id, days)
  if (result.ok) emit('updated', result.data.therapist)
  changingDays.value = null
  if (result.ok) {
    announce(`บันทึกแล้ว: ${props.therapist.name} ${workSummary(result.data.therapist)}`)
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  fail(bannerFor(result.state), () => toggleDay(weekday))
}

// ---- Leave dates --------------------------------------------------------------------------------

const RANGE_MESSAGE: ThaiText = ['เลือกได้ตั้งแต่วันนี้', 'ถึงอีก 60 วัน']
const lastDayOff = computed(() => addDays(props.today, DAY_OFF_WINDOW_DAYS - 1))
const leaveTitleId = computed(() => `leave-${props.therapist.id}-title`)

const adding = ref(false)
const newDate = ref('')
const dateError = ref<ThaiText | null>(null)
/** The date being added or removed. */
const savingDate = ref<string | null>(null)
const addButton = ref<{ focus: () => void } | null>(null)
const dateField = ref<{ focus: () => void } | null>(null)

function startAdding() {
  adding.value = true
  newDate.value = ''
  dateError.value = null
  nextTick(() => dateField.value?.focus())
}

async function addLeave() {
  if (savingDate.value) return
  failure.value = null
  const date = newDate.value
  if (!isIsoDate(date)) dateError.value = 'กรุณาเลือกวันที่'
  else if (date < props.today || date > lastDayOff.value) dateError.value = RANGE_MESSAGE
  else dateError.value = null
  if (dateError.value) {
    dateField.value?.focus()
    return
  }

  savingDate.value = date
  const result = await repository.addLeaveDate(props.therapist.id, date)
  savingDate.value = null
  if (result.ok) {
    emit('updated', result.data.therapist)
    adding.value = false
    announce(`เพิ่มวันลาของ${props.therapist.name} ${shortDateWithYear(date)} แล้ว`)
    nextTick(() => addButton.value?.focus())
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  if (result.state === 'invalid_input') {
    dateError.value = result.fields?.date === 'out_of_range' ? RANGE_MESSAGE : 'กรุณาเลือกวันที่'
    return
  }
  fail(bannerFor(result.state), addLeave)
}

async function removeLeave(date: string) {
  if (savingDate.value) return
  failure.value = null
  savingDate.value = date
  const result = await repository.removeLeaveDate(props.therapist.id, date)
  savingDate.value = null
  if (result.ok) {
    emit('updated', result.data.therapist)
    announce(`ลบวันลาของ${props.therapist.name} ${shortDateWithYear(date)} แล้ว`)
    nextTick(() => addButton.value?.focus())
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  fail(bannerFor(result.state), () => removeLeave(date))
}
</script>

<template>
  <li
    :data-therapist="therapist.id"
    class="grid content-start gap-2.5 rounded-card border border-line bg-card px-[18px] py-4"
  >
    <div class="flex items-center gap-3">
      <UiAvatar
        :initial="therapist.initial"
        :size="44"
      />
      <div>
        <h2 class="text-[18px]">
          {{ therapist.name }}
        </h2>
        <p
          class="text-[14px] text-text-muted"
          data-work-summary
        >
          {{ summary }}
        </p>
      </div>
    </div>

    <div
      role="group"
      :aria-label="`วันทำงานของ${therapist.name}`"
      :aria-busy="changingDays ? 'true' : undefined"
      class="grid grid-cols-7 gap-1.5"
    >
      <button
        v-for="weekday in WEEK_ORDER"
        :key="weekday"
        type="button"
        :aria-label="weekdayName(weekday)"
        :aria-pressed="workDays.includes(weekday) ? 'true' : 'false'"
        :class="[
          'min-h-11 min-w-0 rounded-input border-[1.5px] px-0 text-[14px] font-semibold whitespace-nowrap',
          'transition-[color,background-color,border-color]',
          workDays.includes(weekday) ? 'border-text bg-text text-bg' : 'border-line bg-white text-text hover:border-text-muted',
        ]"
        @click="toggleDay(weekday)"
      >
        {{ shortWeekdayName(weekday) }}
      </button>
    </div>

    <div class="border-t border-dashed border-line pt-2">
      <p
        :id="leaveTitleId"
        class="text-[15px] font-semibold"
      >
        วันลา:
      </p>
      <ul
        v-if="therapist.leaveDates.length > 0"
        role="list"
        :aria-labelledby="leaveTitleId"
      >
        <li
          v-for="date in therapist.leaveDates"
          :key="date"
          class="flex items-center justify-between gap-2.5 text-[15px]"
        >
          <span class="whitespace-nowrap">{{ shortDateWithYear(date) }}</span>
          <UiTextButton
            :busy="savingDate === date"
            busy-label="กำลังลบ…"
            :disabled="savingDate !== null && savingDate !== date"
            @click="removeLeave(date)"
          >
            ลบ<span class="sr-only">{{ `วันลาของ${therapist.name} ${shortDateWithYear(date)}` }}</span>
          </UiTextButton>
        </li>
      </ul>
      <p
        v-else
        class="text-[15px] text-text-muted"
      >
        ยังไม่มีวันลา
      </p>

      <form
        v-if="adding"
        method="dialog"
        novalidate
        :aria-label="`เพิ่มวันลาของ${therapist.name}`"
        class="mt-2 grid max-w-[320px] justify-items-start gap-2"
        @submit.prevent="addLeave"
      >
        <UiTextField
          :id="`leave-date-${therapist.id}`"
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
          :busy="savingDate !== null && savingDate === newDate"
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
        เพิ่มวันลา<span class="sr-only">{{ `ของ${therapist.name}` }}</span>
      </UiTextButton>
    </div>

    <UiStatusBanner
      v-if="failure"
      focus-on-mount
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="retryLast"
    />
  </li>
</template>
