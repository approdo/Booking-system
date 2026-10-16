<script setup lang="ts">
import type { ThaiText } from '~/types/content'

/** Nothing to show (spec section 3, EmptyState): a centred line, an optional second line and a button slot. */
defineProps<{ text: ThaiText, detail?: ThaiText | null }>()
</script>

<template>
  <div class="grid justify-items-center gap-1 py-8 text-center">
    <p class="text-[16px] text-text">
      <PhraseText :text="text" />
    </p>
    <p
      v-if="detail"
      class="text-[14px] text-text-muted"
    >
      <PhraseText :text="detail" />
    </p>
    <slot />
  </div>
</template>
