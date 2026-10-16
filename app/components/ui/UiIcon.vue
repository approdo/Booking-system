<script setup lang="ts">
import { ICON_PATHS } from '~/utils/icons'
import type { IconName } from '~/utils/icons'

/**
 * One icon of the design (app/utils/icons.ts). Decorative: hidden from screen readers, so the text next
 * to the icon, or the button's label, carries the meaning.
 */
withDefaults(defineProps<{ name: IconName, size?: number, strokeWidth?: number }>(), { size: 20, strokeWidth: 1.8 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path
      v-for="path in ICON_PATHS[name]"
      :key="path"
      :d="path"
    />
  </svg>
</template>
