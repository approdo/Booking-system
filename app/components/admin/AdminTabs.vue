<script setup lang="ts">
import { ADMIN_TABS, currentTab } from '~/utils/adminNav'

/**
 * The back office's menu (spec sections 3 and 7), from the one list in app/utils/adminNav.ts:
 *
 * - `top` (1024px and wider): links in the header, 64px high, the current page dark with an accent line under it;
 * - `bottom` (narrower): the tab bar stuck to the bottom of the screen (BottomBar), one column per tab, an icon
 *   over a short label, the current page in accent with a line on top. It is sticky, not fixed, so at the end of
 *   the page it sits under the content instead of over it (G-014).
 *
 * Plain links with aria-current="page", not ARIA tabs (spec section 9). The "การจอง" tab shows how many bookings
 * wait for an answer ("รอยืนยัน") once the list has been loaded.
 */
const props = defineProps<{ placement: 'top' | 'bottom' }>()

const route = useRoute()
const { pending } = useAdminBookings()

const activeKey = computed(() => currentTab(route.path)?.key ?? null)
const columns = computed(() => ({ gridTemplateColumns: `repeat(${ADMIN_TABS.length}, minmax(0, 1fr))` }))
const isTop = computed(() => props.placement === 'top')
</script>

<template>
  <nav
    aria-label="เมนูหลังบ้าน"
    :class="isTop
      ? 'hidden lg:block'
      : 'tab-bar sticky bottom-0 z-10 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] shadow-bar lg:hidden'"
  >
    <ul
      role="list"
      :class="isTop ? 'flex gap-1.5' : 'grid'"
      :style="isTop ? undefined : columns"
    >
      <li
        v-for="tab in ADMIN_TABS"
        :key="tab.key"
      >
        <NuxtLink
          :to="tab.path"
          :aria-current="tab.key === activeKey ? 'page' : undefined"
          :class="[
            'no-underline transition-[color,background-color,border-color]',
            isTop
              ? 'flex min-h-16 items-center gap-2 px-3.5 text-[15px] font-semibold'
              : 'relative grid min-h-[62px] justify-items-center content-center gap-0.5 px-0.5 pt-2 pb-1.5 text-[13px] leading-[1.3] font-semibold',
            tab.key === activeKey
              ? (isTop ? 'text-text shadow-[inset_0_-3px_0_var(--color-accent)]' : 'text-accent shadow-[inset_0_3px_0_var(--color-accent)]')
              : (isTop ? 'text-text-muted hover:text-text' : 'text-text-muted'),
          ]"
        >
          <UiIcon
            :name="tab.icon"
            :size="isTop ? 20 : 22"
          />
          <span class="whitespace-nowrap">{{ tab.label }}</span>
          <template v-if="tab.showsPending && pending">
            <span
              aria-hidden="true"
              :class="[
                'inline-grid h-[22px] min-w-[22px] place-items-center rounded-button bg-accent px-1.5 text-[13px] leading-none font-semibold text-white',
                isTop ? '' : 'absolute top-1 left-[calc(50%+6px)]',
              ]"
            >{{ pending }}</span>
            <span class="sr-only">{{ ` รอยืนยัน ${pending}` }}</span>
          </template>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>
