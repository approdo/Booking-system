<script setup lang="ts" generic="T extends string">
/**
 * A group of filter chips (spec section 3, FilterChip): pill buttons with aria-pressed, one pressed at a time,
 * at least 44px high, wrapping onto the next line instead of scrolling sideways. The pressed one is dark
 * (text on bg, C3), apart from the accent of a booking's answers. A count after the label is optional (null:
 * not known yet).
 */
defineProps<{
  label: string
  options: readonly { value: T, label: string, count?: number | null }[]
}>()

const value = defineModel<T>({ required: true })

/** Holds the place of a count that is not known yet, as wide as a digit, so the chips do not jump. */
const FIGURE_SPACE = String.fromCharCode(0x2007)
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="flex flex-wrap gap-2"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="value === option.value ? 'true' : 'false'"
      :class="[
        'inline-flex min-h-11 items-center gap-1 rounded-button border-[1.5px] px-3.5 text-[15px] font-semibold whitespace-nowrap',
        'transition-[color,background-color,border-color]',
        value === option.value ? 'border-text bg-text text-bg' : 'border-line bg-white text-text hover:border-text-muted',
      ]"
      @click="value = option.value"
    >
      {{ option.label }}<span
        v-if="option.count !== undefined"
        :class="['font-normal', value === option.value ? 'text-bg' : 'text-text-muted']"
      >{{ option.count ?? FIGURE_SPACE }}</span>
    </button>
  </div>
</template>
