<script setup lang="ts">
import { SETTINGS_PAGES } from '~/utils/adminNav'

/**
 * The sub-menu of "ตั้งค่าร้าน" (spec section 7): one link per page of the tab, opening hours first (C10),
 * drawn like filter chips (the current page dark, as a pressed chip) with aria-current="page". It is only
 * there while the tab has more than one page, so a cut screen (D-002) leaves no menu of one item.
 */
const route = useRoute()

function isCurrent(path: string) {
  return route.path === path || `${route.path}/` === path
}
</script>

<template>
  <nav
    v-if="SETTINGS_PAGES.length > 1"
    aria-label="หัวข้อตั้งค่าร้าน"
    class="mb-4"
  >
    <ul
      role="list"
      class="flex flex-wrap gap-2"
    >
      <li
        v-for="page in SETTINGS_PAGES"
        :key="page.path"
      >
        <NuxtLink
          :to="page.path"
          :aria-current="isCurrent(page.path) ? 'page' : undefined"
          :class="[
            'inline-flex min-h-11 items-center rounded-button border-[1.5px] px-3.5 text-[15px] font-semibold whitespace-nowrap no-underline',
            'transition-[color,background-color,border-color]',
            isCurrent(page.path) ? 'border-text bg-text text-bg' : 'border-line bg-white text-text hover:border-text-muted',
          ]"
        >
          {{ page.label }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
