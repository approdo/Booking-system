<script setup lang="ts">
import type { ThaiText } from '~/types/content'

/**
 * The top of every back-office page (spec section 7): the heading (28px) and a short muted line under it, and
 * room on the right for the page's own button. The heading takes the focus after a change of page, so the
 * keyboard and screen readers start at the new page.
 */
defineProps<{ title: string, detail?: ThaiText | null }>()

const heading = ref<HTMLElement | null>(null)
// The page the visit starts on (drawn from the pre-rendered HTML) keeps the browser's own start; pages
// opened after it move the focus to their heading.
const openedByNavigation = !useNuxtApp().isHydrating

onMounted(() => {
  if (openedByNavigation) heading.value?.focus()
})
</script>

<template>
  <div class="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
    <div>
      <h1
        ref="heading"
        tabindex="-1"
        class="text-[28px]"
      >
        {{ title }}
      </h1>
      <p class="min-h-6 text-[14px] text-text-muted">
        <PhraseText
          v-if="detail"
          :text="detail"
        />
      </p>
    </div>
    <slot />
  </div>
</template>
