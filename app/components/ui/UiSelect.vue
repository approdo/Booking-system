<script setup lang="ts">
import type { ThaiText } from '~/types/content'

/**
 * A labelled select (spec section 3, Field): drawn like a text input (white, muted border, 16px text) with
 * its own chevron instead of the browser's arrow. 48px high; `compact` makes it 44px with a small muted
 * label above (the three times in a row of the opening hours). `hideLabel` keeps the label for screen
 * readers only (the therapist filter of the bookings, whose first option already says "หมอนวด: ทุกคน").
 *
 * The label slot can hold words for screen readers only, e.g. the day a time belongs to.
 */
const props = withDefaults(defineProps<{
  id: string
  label?: string
  options: readonly { value: string, label: string }[]
  compact?: boolean
  hideLabel?: boolean
  required?: boolean
  error?: ThaiText | null
}>(), { label: '', error: null })

const value = defineModel<string>({ default: '' })

const select = ref<HTMLSelectElement | null>(null)
const errorId = computed(() => `${props.id}-error`)

defineExpose({ focus: () => select.value?.focus() })
</script>

<template>
  <div :class="['grid', compact ? 'gap-0.5' : 'gap-1.5']">
    <label
      :for="id"
      :class="hideLabel ? 'sr-only' : compact ? 'text-[13px] text-text-muted' : 'text-[15px] font-semibold'"
    >
      <slot name="label">{{ label }}</slot><template v-if="required">{{ ' ' }}<span
        class="text-accent"
        aria-hidden="true"
      >*</span><span class="sr-only">(จำเป็น)</span></template>
    </label>
    <div class="relative">
      <select
        :id="id"
        ref="select"
        v-model="value"
        :name="id"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? errorId : undefined"
        :class="[
          'w-full cursor-pointer appearance-none rounded-input text-[16px] text-text focus-visible:border-accent',
          'transition-[color,background-color,border-color]',
          compact ? 'min-h-11 pr-8 pl-2.5' : 'min-h-12 pr-10 pl-3.5',
          error ? 'border-2 border-danger bg-danger-tint' : 'border border-text-muted bg-white hover:border-text',
        ]"
      >
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <UiIcon
        name="down"
        :size="18"
        :class="['pointer-events-none absolute top-1/2 -translate-y-1/2 text-text-muted', compact ? 'right-2' : 'right-3']"
      />
    </div>
    <p
      v-if="error"
      :id="errorId"
      class="flex items-start gap-1.5 text-[14px] leading-normal text-danger"
    >
      <UiIcon
        name="err"
        :size="18"
        class="mt-px"
      />
      <span><PhraseText :text="error" /></span>
    </p>
  </div>
</template>
