<script setup lang="ts">
import type { ThaiText } from '~/types/content'
import type { BannerVariant } from '~/utils/statusBanners'
import { RETRY_LABEL } from '~/utils/statusBanners'

/**
 * A message box (spec section 3, StatusBanner): `info` (surface), `warning` (accent-soft, accent border)
 * or `error` (danger tint, danger border), with an icon, an optional serif title, the text, and an
 * optional button: "ลองใหม่" with `retry`, or anything in the default slot.
 *
 * warning and error are role="alert", info is role="status"; `note` makes it a plain note instead, for a
 * warning that is part of the page from the start (the demo warning of the booking form). A banner that
 * appears because the visitor pressed something takes the focus (`focusOnMount`), so the keyboard and
 * screen reader land on it.
 */
const props = defineProps<{
  variant: BannerVariant
  title?: ThaiText | null
  text: ThaiText
  retry?: boolean
  focusOnMount?: boolean
  note?: boolean
}>()

defineEmits<{ retry: [] }>()

const box = ref<HTMLElement | null>(null)

const look = computed(() => ({
  info: { box: 'bg-surface', icon: 'info' as const, iconColor: 'text-accent-hover', title: 'text-text' },
  warning: { box: 'border-[1.5px] border-accent bg-accent-soft', icon: 'alert' as const, iconColor: 'text-accent-hover', title: 'text-accent-hover' },
  error: { box: 'border-[1.5px] border-danger bg-danger-tint', icon: 'err' as const, iconColor: 'text-danger', title: 'text-danger' },
}[props.variant]))

onMounted(() => {
  if (props.focusOnMount) box.value?.focus()
})

defineExpose({ focus: () => box.value?.focus() })
</script>

<template>
  <div
    ref="box"
    :role="note ? 'note' : variant === 'info' ? 'status' : 'alert'"
    :tabindex="focusOnMount ? -1 : undefined"
    :class="['grid grid-cols-[22px_1fr] gap-3 rounded-card px-[18px] py-4', look.box]"
  >
    <UiIcon
      :name="look.icon"
      :size="22"
      :class="['mt-0.5', look.iconColor]"
    />
    <div class="min-w-0">
      <p
        v-if="title"
        :class="['font-heading text-[19px] leading-[1.4] font-semibold', look.title]"
      >
        <PhraseText :text="title" />
      </p>
      <p class="text-[15px] leading-[1.6]">
        <PhraseText :text="text" />
      </p>
      <div
        v-if="retry || $slots.default"
        class="mt-3"
      >
        <UiButton
          v-if="retry"
          variant="outline"
          size="sm"
          @click="$emit('retry')"
        >
          {{ RETRY_LABEL }}
        </UiButton>
        <slot />
      </div>
    </div>
  </div>
</template>
