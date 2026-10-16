<script setup lang="ts">
import type { ThaiText } from '~/types/content'

/**
 * The booking's details as a list of terms and values (spec section 6): the summary above the form of
 * screen 4 and the ticket of screen 5. Values are phrases, so they wrap between phrases only (G-007).
 */
defineProps<{
  rows: readonly { term: string, value: ThaiText }[]
  /** 'end': values on the right (the ticket). */
  align?: 'start' | 'end'
}>()
</script>

<template>
  <dl class="grid grid-cols-[auto_1fr] gap-x-4">
    <template
      v-for="row in rows"
      :key="row.term"
    >
      <dt class="text-text-muted">
        {{ row.term }}
      </dt>
      <dd :class="['font-semibold', align === 'end' ? 'text-right' : '']">
        <PhraseText :text="row.value" />
      </dd>
    </template>
  </dl>
</template>
