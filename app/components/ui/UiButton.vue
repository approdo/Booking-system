<script setup lang="ts">
import type { ThaiText } from '~/types/content'
import type { IconName } from '~/utils/icons'

/**
 * The button of the design (spec section 3): a pill, primary (accent) or outline, 48px high (`sm` 44px).
 * With `to` it is a link that looks the same.
 *
 * - `busy`: a spinner and `busyLabel` (what is happening, e.g. "กำลังเตรียมข้อมูลตัวอย่าง…", as phrases so a
 *   narrow screen can break it in two); pressing it again does nothing.
 * - `disabled`: looks switched off but keeps the keyboard focus (aria-disabled, not `disabled`), so it can
 *   say why: pressing it emits `blocked` and the page announces the reason.
 * In both cases a click is cancelled, so a submit button does not submit its form.
 */
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'outline'
  size?: 'md' | 'sm'
  block?: boolean
  type?: 'button' | 'submit'
  to?: string
  form?: string
  busy?: boolean
  busyLabel?: ThaiText
  disabled?: boolean
  /** An icon after the text, e.g. 'right' on "ถัดไป". */
  icon?: IconName
}>(), { variant: 'primary', size: 'md', type: 'button', to: undefined, form: undefined, busyLabel: undefined, icon: undefined })

const emit = defineEmits<{ click: [event: MouseEvent], blocked: [] }>()

const classes = computed(() => [
  'inline-flex items-center justify-center gap-2 rounded-button border-[1.5px] font-semibold no-underline',
  props.busy ? 'text-left leading-tight' : 'leading-none whitespace-nowrap',
  'transition-[color,background-color,border-color]',
  props.size === 'sm' ? 'min-h-11 px-[18px] text-[15px]' : 'min-h-12 px-6 text-[16px]',
  props.block ? 'flex w-full' : '',
  props.disabled && !props.busy
    ? 'cursor-not-allowed border-transparent bg-surface text-text-muted'
    : props.variant === 'primary'
      ? 'border-transparent bg-accent text-white hover:bg-accent-hover'
      : 'border-text bg-transparent text-text hover:bg-text hover:text-bg',
  props.busy ? 'cursor-progress' : '',
])

function onClick(event: MouseEvent) {
  if (props.busy || props.disabled) {
    event.preventDefault()
    if (!props.busy) emit('blocked')
    return
  }
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
    <slot />
    <UiIcon
      v-if="icon"
      :name="icon"
    />
  </NuxtLink>
  <button
    v-else
    ref="element"
    :type="type"
    :form="form"
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
      <slot />
      <UiIcon
        v-if="icon"
        :name="icon"
      />
    </template>
  </button>
</template>
