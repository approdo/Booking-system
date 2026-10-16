<script setup lang="ts">
import { seed } from '~/data/seed'
import type { Service } from '~/types/api'
import type { ThaiText } from '~/types/content'
import { SERVICE_MAX_OPTIONS, serviceFieldMessages, validateService } from '~/utils/bookingRules'
import type { ServiceFieldError } from '~/utils/bookingRules'
import { MINUTES_CHOICES, nextFreeMinutes, parsePrice } from '~/utils/serviceForm'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

/**
 * The form of one service (spec section 7): "เพิ่มบริการ" or "แก้ไขบริการ" in a dialog. Category, name, an
 * optional description, one to four lengths with their prices, and "รับจอง". It is checked here with the rules
 * the API uses (validateService), so the messages match; nothing is saved until "บันทึก". There is no delete:
 * a service is closed for bookings instead.
 */
const emit = defineEmits<{ saved: [service: Service, isNew: boolean] }>()

const { repository, leaveIfSignedOut } = useAdminSession()
const announce = useAnnounce()

const CATEGORY_IDS = seed.serviceCategories.map(category => category.id)
const categoryChoices = seed.serviceCategories.map(category => ({ value: category.id, label: category.name }))

interface OptionRow { key: number, minutes: string, price: string }

const dialog = ref<{ open: () => void, close: () => void } | null>(null)
const editing = ref<Service | null>(null)
const categoryId = ref(CATEGORY_IDS[0]!)
const name = ref('')
const description = ref('')
const rows = ref<OptionRow[]>([])
const enabled = ref(true)
let nextKey = 0

type Field = 'categoryId' | 'name' | 'description' | 'options'
const errors = reactive<Record<Field, ThaiText | null>>({ categoryId: null, name: null, description: null, options: null })
const failure = ref<BannerContent | null>(null)
const saving = ref(false)

const categoryField = ref<{ focus: () => void } | null>(null)
const nameField = ref<{ focus: () => void } | null>(null)
const descriptionField = ref<{ focus: () => void } | null>(null)

function newRow(minutes: number, price = ''): OptionRow {
  nextKey += 1
  return { key: nextKey, minutes: String(minutes), price }
}

function clearErrors() {
  errors.categoryId = null
  errors.name = null
  errors.description = null
  errors.options = null
  failure.value = null
}

/** Opens the form for a service, or empty for a new one (in the category the list is showing). */
function open(service: Service | null, defaultCategory?: string) {
  editing.value = service
  categoryId.value = service?.categoryId ?? (defaultCategory && CATEGORY_IDS.includes(defaultCategory) ? defaultCategory : CATEGORY_IDS[0]!)
  name.value = service?.name ?? ''
  description.value = service?.description ?? ''
  rows.value = service ? service.options.map(option => newRow(option.minutes, String(option.price))) : [newRow(60)]
  enabled.value = service?.enabled ?? true
  clearErrors()
  nextTick(() => dialog.value?.open())
}

function addRow() {
  rows.value = [...rows.value, newRow(nextFreeMinutes(rows.value.map(row => Number(row.minutes))))]
}

function removeRow(key: number) {
  rows.value = rows.value.filter(row => row.key !== key)
}

/** Shows error codes (from the check here or from the API) at their fields and focuses the first one. */
function showErrors(found: Partial<Record<string, string>>) {
  const message = (code: string | undefined) => (code ? serviceFieldMessages[code as ServiceFieldError] ?? null : null)
  errors.categoryId = message(found.categoryId)
  errors.name = message(found.name)
  errors.description = message(found.description)
  errors.options = message(found.options)
  if (found.services) failure.value = { variant: 'error', title: null, text: serviceFieldMessages.services_too_many, retry: false }
  nextTick(() => {
    if (errors.categoryId) categoryField.value?.focus()
    else if (errors.name) nameField.value?.focus()
    else if (errors.description) descriptionField.value?.focus()
    else if (errors.options) document.querySelector<HTMLElement>('#service-options select, #service-options input, #service-add-option')?.focus()
  })
}

async function save() {
  if (saving.value) return
  clearErrors()
  const options = rows.value.map(row => ({ minutes: Number(row.minutes), price: parsePrice(row.price) }))
  const checked = validateService({ categoryId: categoryId.value, name: name.value, description: description.value, options }, CATEGORY_IDS)
  if (Object.keys(checked.errors).length > 0) {
    showErrors(checked.errors)
    return
  }

  const fields = { ...checked.service, options: [...checked.service.options], enabled: enabled.value }
  const current = editing.value
  const isNew = current === null
  saving.value = true
  const result = current ? await repository.updateService(current.id, fields) : await repository.createService(fields)
  saving.value = false

  if (result.ok) {
    emit('saved', result.data.service, isNew)
    announce(isNew ? `เพิ่มบริการ ${result.data.service.name} แล้ว` : `บันทึก ${result.data.service.name} แล้ว`)
    dialog.value?.close()
    return
  }
  if (await leaveIfSignedOut(result.state)) {
    dialog.value?.close()
    return
  }
  if (result.state === 'invalid_input' && result.fields) {
    showErrors(result.fields)
    return
  }
  failure.value = bannerFor(result.state)
}

defineExpose({ open })
</script>

<template>
  <UiDialog
    id="service-dialog"
    ref="dialog"
    :title="editing ? 'แก้ไขบริการ' : 'เพิ่มบริการ'"
  >
    <form
      id="service-form"
      method="dialog"
      novalidate
      class="grid gap-4"
      @submit.prevent="save"
    >
      <UiSelect
        id="service-category"
        ref="categoryField"
        v-model="categoryId"
        label="หมวด"
        required
        :options="categoryChoices"
        :error="errors.categoryId"
      />
      <UiTextField
        id="service-name"
        ref="nameField"
        v-model="name"
        label="ชื่อบริการ"
        required
        autocomplete="off"
        :error="errors.name"
      />
      <UiTextField
        id="service-description"
        ref="descriptionField"
        v-model="description"
        label="คำอธิบาย"
        multiline
        :hint="['ไม่บังคับ ', '· ไม่เกิน 200 ตัวอักษร']"
        :error="errors.description"
      />

      <fieldset
        id="service-options"
        :aria-describedby="errors.options ? 'service-options-error' : undefined"
      >
        <legend class="text-[15px] font-semibold">
          ระยะเวลาและราคา<span
            class="text-accent"
            aria-hidden="true"
          > *</span><span class="sr-only">(จำเป็น)</span>
        </legend>
        <div
          v-if="rows.length > 0"
          aria-hidden="true"
          class="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2 text-[14px] text-text-muted"
        >
          <span>ระยะเวลา</span>
          <span>ราคา (บาท)</span>
        </div>
        <ul
          role="list"
          class="mt-1 grid gap-2"
        >
          <li
            v-for="(row, index) in rows"
            :key="row.key"
            class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2"
          >
            <UiSelect
              :id="`service-minutes-${row.key}`"
              v-model="row.minutes"
              :label="`ระยะเวลา ตัวเลือกที่ ${index + 1}`"
              hide-label
              :options="MINUTES_CHOICES"
            />
            <UiTextField
              :id="`service-price-${row.key}`"
              v-model="row.price"
              :label="`ราคา ตัวเลือกที่ ${index + 1} (บาท)`"
              hide-label
              inputmode="numeric"
              autocomplete="off"
            />
            <UiIconButton
              icon="close"
              :label="`ลบตัวเลือกที่ ${index + 1}`"
              @click="removeRow(row.key)"
            />
          </li>
        </ul>
        <p
          v-if="errors.options"
          id="service-options-error"
          class="mt-1.5 flex items-start gap-1.5 text-[14px] leading-normal text-danger"
        >
          <UiIcon
            name="err"
            :size="18"
            class="mt-px"
          />
          <span><PhraseText :text="errors.options" /></span>
        </p>
        <UiTextButton
          v-if="rows.length < SERVICE_MAX_OPTIONS"
          id="service-add-option"
          class="-ml-2"
          icon="plus"
          @click="addRow"
        >
          เพิ่มตัวเลือก
        </UiTextButton>
      </fieldset>

      <UiSwitch
        id="service-enabled"
        v-model="enabled"
        label="รับจอง"
      />

      <UiStatusBanner
        v-if="failure"
        focus-on-mount
        :variant="failure.variant"
        :title="failure.title"
        :text="failure.text"
        :retry="failure.retry"
        @retry="save"
      />
      <div class="flex flex-wrap gap-2">
        <UiButton
          type="submit"
          :busy="saving"
          busy-label="กำลังบันทึก…"
        >
          บันทึก
        </UiButton>
        <UiButton
          variant="outline"
          :disabled="saving"
          @click="dialog?.close()"
        >
          ยกเลิก
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
