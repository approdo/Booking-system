<script setup lang="ts">
import { BOOKING_STEPS } from '~/utils/bookingSteps'

/**
 * The progress bar under the booking header (spec section 3, Progress): five bars, accent up to the
 * current step. The step names show from 768px; on phones they are read by screen readers only.
 * Not links: the visitor moves with "ถัดไป" and "ย้อนกลับ".
 */
defineProps<{ current: number }>()
</script>

<template>
  <ol
    aria-label="ความคืบหน้า"
    class="grid grid-cols-5 gap-1.5 pb-3"
  >
    <li
      v-for="(step, index) in BOOKING_STEPS"
      :key="step.path"
      :aria-current="index + 1 === current ? 'step' : undefined"
      :class="['grid gap-1.5 text-[14px] leading-[1.3]', index + 1 === current ? 'font-semibold text-text' : 'text-text-muted']"
    >
      <span
        aria-hidden="true"
        :class="['h-1.5 rounded-full', index + 1 <= current ? 'bg-accent' : 'bg-line']"
      />
      <span class="sr-only md:not-sr-only">{{ step.label }}</span>
    </li>
  </ol>
</template>
