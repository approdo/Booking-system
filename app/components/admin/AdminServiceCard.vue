<script setup lang="ts">
import type { Service } from '~/types/api'
import { formatPrice } from '~/utils/bookingFormat'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

/**
 * One service in the back office (spec section 7, "บริการและราคา"): its category, name and prices, the switch
 * "รับจอง", which saves at once, and "แก้ไข", which opens the form (the page's dialog). A service closed for
 * bookings stays in the list on a darker card with "ปิดชั่วคราว"; customers no longer see it.
 */
const props = defineProps<{ service: Service, categoryName: string }>()
const emit = defineEmits<{ updated: [service: Service], edit: [service: Service] }>()

const { repository, leaveIfSignedOut } = useAdminSession()
const announce = useAnnounce()

const saving = ref(false)
const failure = ref<BannerContent | null>(null)
/** The switch moves at once; if the change cannot be saved it moves back. */
const switching = ref<boolean | null>(null)
const enabled = computed({
  get: () => switching.value ?? props.service.enabled,
  set: value => setEnabled(value),
})

async function setEnabled(value: boolean) {
  if (saving.value) return
  failure.value = null
  saving.value = true
  switching.value = value
  const result = await repository.updateService(props.service.id, { enabled: value })
  saving.value = false
  if (result.ok) emit('updated', result.data.service)
  switching.value = null
  if (result.ok) {
    announce(`${props.service.name} ${value ? 'เปิดรับจองแล้ว' : 'ปิดรับจองชั่วคราวแล้ว'}`)
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  failure.value = bannerFor(result.state)
}
</script>

<template>
  <li :class="['grid content-start gap-2 rounded-card border border-line px-[18px] py-4', service.enabled ? 'bg-card' : 'bg-surface']">
    <p class="text-[13px] font-semibold tracking-[.06em] text-gold-ink">
      {{ categoryName }}
    </p>
    <h3 class="text-[18px]">
      {{ service.name }}<template v-if="!service.enabled">
        {{ ' ' }}<span class="font-body text-[14px] font-normal text-text-muted">ปิดชั่วคราว</span>
      </template>
    </h3>
    <ul
      role="list"
      class="flex flex-wrap gap-1.5"
    >
      <li
        v-for="option in service.options"
        :key="option.minutes"
        class="rounded-button border border-line bg-white px-2.5 text-[14px] whitespace-nowrap"
      >
        {{ option.minutes }} นาที · {{ formatPrice(option.price) }}
      </li>
    </ul>
    <div class="flex items-center justify-between gap-2 border-t border-dashed border-line pt-1">
      <UiSwitch
        :id="`service-enabled-${service.id}`"
        v-model="enabled"
        label="รับจอง"
        :hidden-label="service.name"
        :busy="saving"
      />
      <UiTextButton @click="emit('edit', service)">
        แก้ไข<span class="sr-only">{{ ` ${service.name}` }}</span>
      </UiTextButton>
    </div>
    <UiStatusBanner
      v-if="failure"
      focus-on-mount
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="setEnabled(!service.enabled)"
    />
  </li>
</template>
