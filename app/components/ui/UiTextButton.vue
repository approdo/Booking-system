<script setup lang="ts">
import type { ThaiText } from '~/types/content'
import type { IconName } from '~/utils/icons'

/**
 * A button that is only words (spec section 3, C4): accent, no underline until hover or focus, at least
 * 44px high. `muted` gives the grey "ย้อนกลับ" of the booking screens. With `to` it is a link.
 *
 * `busy` (a change that is being saved, e.g. "คืนคิว"): a spinner and `busyLabel`, and a press does nothing.
 * `disabled`: switched off while another button of the same card saves; it keeps the keyboard focus.
 */
const props = withDefaults(defineProps<{
  to?: string
  icon?: IconName
  muted?: boolean
  busy?: boolean
  busyLabel?: ThaiText
  disabled?: boolean
}>(), { to: undefined, icon: undefined, busyLabel: undefined })

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const classes = computed(() => [
  'inline-flex min-h-11 items-center gap-1 px-2 text-[15px] no-underline underline-offset-3',
  props.muted ? '-ml-2 text-text-muted' : 'font-semibold text-accent',
  props.busy || props.disabled ? 'cursor-not-allowed' : 'hover:underline focus-visible:underline',
  props.disabled && !props.busy ? 'text-text-muted' : '',
])

function onClick(event: MouseEvent) {
  if (props.busy || props.disabled) return
  emit('click', event)
}

const element = ref<HTMLElement | null>(null)
defineExpose({ focus: () => element.value?.focus() })
</script>

<template>
  <NuxtLink
    v-if="to"
    :to="to"
    :class="classes"
  >
    <UiIcon
      v-if="icon"
      :name="icon"
    />
    <slot />
  </NuxtLink>
  <button
    v-else
    ref="element"
    type="button"
    :class="classes"
    :aria-disabled="busy || disabled ? 'true' : undefined"
    @click="onClick"
  >
    <template v-if="busy">
      <span
        class="spinner"
        aria-hidden="true"
      />
      <PhraseText
        v-if="busyLabel"
        :text="busyLabel"
      />
    </template>
    <template v-else>
      <UiIcon
        v-if="icon"
        :name="icon"
      />
      <slot />
    </template>
  </button>
</template>
