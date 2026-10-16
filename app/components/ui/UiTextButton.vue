<script setup lang="ts">
import type { IconName } from '~/utils/icons'

/**
 * A button that is only words (spec section 3, C4): accent, no underline until hover or focus, at least
 * 44px high. `muted` gives the grey "ย้อนกลับ" of the booking screens. With `to` it is a link.
 */
const props = withDefaults(defineProps<{
  to?: string
  icon?: IconName
  muted?: boolean
}>(), { to: undefined, icon: undefined })

defineEmits<{ click: [event: MouseEvent] }>()

const classes = computed(() => [
  'inline-flex min-h-11 items-center gap-1 px-2 text-[15px] no-underline underline-offset-3 hover:underline focus-visible:underline',
  props.muted ? '-ml-2 text-text-muted' : 'font-semibold text-accent',
])
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
    type="button"
    :class="classes"
    @click="$emit('click', $event)"
  >
    <UiIcon
      v-if="icon"
      :name="icon"
    />
    <slot />
  </button>
</template>
