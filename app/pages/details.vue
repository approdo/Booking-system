<script setup lang="ts">
import { sampleCustomer } from '~/data/sampleCustomer'
import type { ThaiText } from '~/types/content'
import { stateMessages } from '~/utils/bookingRepository'
import { clearDraft, writeLastBooking } from '~/utils/bookingDraft'
import type { BookingDraft } from '~/utils/bookingDraft'
import { formatPrice, longDate, timeRange } from '~/utils/bookingFormat'
import { customerFieldMessages, validateCustomer } from '~/utils/bookingRules'
import type { CustomerFieldErrors } from '~/utils/bookingRules'
import { bannerFor, preparingLabel } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// Step 4, "name and phone" (spec section 6): the summary, the demo warning with "เติมข้อมูลตัวอย่าง" (D-004,
// always above the fields), and the form. The form is checked here and again by the API (N8); it is never
// submitted the native way, so nothing goes into the URL (G-035: method="dialog" and a submit handler).
// The form appears only once the page runs in the browser (the draft is in sessionStorage), so nothing can be
// typed before Vue takes over. The first booking of a browser creates its sandbox: the button then says
// "กำลังเตรียมข้อมูลตัวอย่าง…" (spec section 5, preparing).
const heading = ref<HTMLElement | null>(null)
const { draft, ready, save } = useBookingStep(4, heading)
const repository = useBookingRepository()
const announce = useAnnounce()
const flash = useState<'slot_taken' | null>('booking:flash', () => null)

const name = ref('')
const phone = ref('')
const errors = reactive<{ name: ThaiText | null, phone: ThaiText | null }>({ name: null, phone: null })
const nameField = ref<{ focus: () => void } | null>(null)
const phoneField = ref<{ focus: () => void } | null>(null)

const busy = ref(false)
const busyLabel = ref<ThaiText>('')
const failure = ref<BannerContent | null>(null)

watch(ready, (isReady) => {
  if (!isReady) return
  name.value = draft.value.name ?? ''
  phone.value = draft.value.phone ?? ''
})

// What is typed stays in the draft, so "ย้อนกลับ" and back again keeps it; a change clears that field's error.
watch(name, (value) => {
  errors.name = null
  if (ready.value) save({ ...draft.value, name: value })
})
watch(phone, (value) => {
  errors.phone = null
  if (ready.value) save({ ...draft.value, phone: value })
})

const details = computed(() => {
  const { service, therapist, date, time } = draft.value
  if (!service || !therapist || !date || !time) return []
  return [
    { term: 'บริการ', value: [`${service.name} · `, `${service.minutes} นาที`] },
    { term: 'หมอนวด', value: therapist.name },
    { term: 'วันเวลา', value: [`${longDate(date)} · `, timeRange(time.start, time.end)] },
    { term: 'ราคา', value: [`${formatPrice(service.price)} `, '(จ่ายที่ร้าน)'] },
  ]
})

/** "เติมข้อมูลตัวอย่าง": reserved values that pass the checks (G-005, D-010); the watchers clear the errors. */
function fillSample() {
  name.value = sampleCustomer.name
  phone.value = sampleCustomer.phone
  errors.name = null
  errors.phone = null
  announce('เติมข้อมูลตัวอย่างแล้ว')
}

function showFieldErrors(found: CustomerFieldErrors) {
  errors.name = found.name ? customerFieldMessages.name[found.name] : null
  errors.phone = found.phone ? customerFieldMessages.phone[found.phone] : null
  nextTick(() => (found.name ? nameField : phoneField).value?.focus())
}

/** Where a refused booking goes back to: a field of this form, or the screen of the answer that no longer fits. */
function handleFieldErrors(fields: Record<string, string>) {
  const customer: CustomerFieldErrors = {}
  if (fields.name) customer.name = fields.name as CustomerFieldErrors['name']
  if (fields.phone) customer.phone = fields.phone as CustomerFieldErrors['phone']
  if (customer.name || customer.phone) return showFieldErrors(customer)
  if (fields.serviceId || fields.minutes) return goBack({ ...draft.value, service: undefined }, '/')
  if (fields.therapistId) return goBack({ ...draft.value, therapist: undefined }, '/therapist/')
  return timeTaken()
}

function goBack(next: BookingDraft, path: string) {
  save({ ...next, date: undefined, time: undefined })
  return navigateTo(path)
}

function timeTaken() {
  save({ ...draft.value, time: undefined })
  flash.value = 'slot_taken'
  return navigateTo('/time/')
}

async function submit() {
  if (busy.value) return
  const { service, therapist, date, time } = draft.value
  if (!service || !therapist || !date || !time) return

  const checked = validateCustomer({ name: name.value, phone: phone.value })
  if (checked.errors.name || checked.errors.phone) {
    showFieldErrors(checked.errors)
    return
  }

  failure.value = null
  const preparing = repository.willPrepareSandbox()
  busyLabel.value = preparing ? preparingLabel : 'กำลังยืนยัน…'
  if (preparing) announce(stateMessages.preparing.text)
  busy.value = true
  const result = await repository.createBooking({
    serviceId: service.id,
    minutes: service.minutes,
    therapistId: therapist.id,
    date,
    time: time.start,
    name: checked.name,
    phone: checked.phone,
  })
  busy.value = false

  if (result.ok) {
    writeLastBooking(result.data.booking)
    clearDraft()
    await navigateTo('/done/')
    return
  }
  if (result.state === 'slot_taken') return timeTaken()
  if (result.state === 'invalid_input' && result.fields) return handleFieldErrors(result.fields)
  // rate_limited, demo_full, unavailable (with "ลองใหม่"), sandbox_expired: a banner under the lead.
  failure.value = bannerFor(result.state)
}
</script>

<template>
  <div>
    <div class="mx-auto w-[min(100%-32px,760px)] pt-4 pb-9 md:pt-6">
      <UiTextButton
        to="/time/"
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
        <PhraseText :text="['ชื่อและเบอร์', 'สำหรับคิวนี้']" />
      </h1>
      <p class="mt-1.5 text-text-muted">
        <PhraseText :text="['ตรวจรายละเอียดอีกครั้ง ', 'แล้วกรอกชื่อกับเบอร์', 'ที่ร้านใช้ติดต่อ']" />
      </p>

      <UiStatusBanner
        v-if="failure"
        class="mt-5"
        focus-on-mount
        :variant="failure.variant"
        :title="failure.title"
        :text="failure.text"
        :retry="failure.retry"
        @retry="submit"
      />

      <UiLoading
        v-if="!ready"
        class="mt-5"
      >
        <div class="skeleton h-[140px] rounded-card" />
        <div class="skeleton mt-5 h-[170px] rounded-card" />
      </UiLoading>
      <template v-else>
        <div class="mt-5 rounded-card border border-line bg-card px-[18px] py-3.5 text-[15px]">
          <BookingDetails :rows="details" />
        </div>

        <UiStatusBanner
          id="demo-warning"
          class="mt-5"
          variant="warning"
          note
          :title="['ห้ามกรอกข้อมูลจริง']"
          :text="['เว็บนี้เป็นตัวอย่างผลงาน ', 'ไม่มีการจองจริง ', '— ใช้ชื่อสมมติ', 'และเบอร์ ', '02-000-0000 ', 'หรือกดปุ่มด้านล่าง']"
        >
          <UiButton
            variant="outline"
            size="sm"
            @click="fillSample"
          >
            เติมข้อมูลตัวอย่าง
          </UiButton>
        </UiStatusBanner>

        <form
          id="booking-form"
          method="dialog"
          novalidate
          class="mt-6 grid gap-[18px]"
          data-hydrated="true"
          @submit.prevent="submit"
        >
          <UiTextField
            id="customer-name"
            ref="nameField"
            v-model="name"
            label="ชื่อ"
            required
            autocomplete="off"
            :error="errors.name"
          />
          <UiTextField
            id="customer-phone"
            ref="phoneField"
            v-model="phone"
            label="เบอร์โทร"
            required
            inputmode="tel"
            autocomplete="off"
            :error="errors.phone"
            :hint="['ร้านใช้เบอร์นี้', 'ติดต่อเรื่องคิวนี้เท่านั้น']"
          />
        </form>
      </template>
    </div>

    <BookingActionBar
      v-if="ready && draft.service"
      summary="จ่ายที่ร้าน"
      :price="draft.service.price"
      label="ยืนยันการจอง"
      type="submit"
      form="booking-form"
      :busy="busy"
      :busy-label="busyLabel"
    />
  </div>
</template>
