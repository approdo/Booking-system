<script setup lang="ts">
import type { IconName } from '~/utils/icons'

/** A square button with only an icon (spec section 3): 44 × 44, and a label for screen readers. */
defineProps<{ icon: IconName, label: string, disabled?: boolean }>()
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :disabled="disabled"
    class="grid size-11 place-items-center rounded-input border-[1.5px] border-line bg-card text-text transition-[color,background-color,border-color] enabled:hover:border-text-muted disabled:cursor-not-allowed disabled:text-text-muted"
    @click="$emit('click', $event)"
  >
    <UiIcon :name="icon" />
  </button>
</template>
