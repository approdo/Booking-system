<script setup lang="ts">
import { site } from '~/data/site'
import type { SiteSide } from '~/utils/pageTitle'

/**
 * The header of every page (spec section 3, AppHeader): the shop name and the side under it.
 * The logo leads to the start of the booking, or to the back office's first page.
 */
const props = defineProps<{ side: SiteSide }>()

const { t } = useI18n()
const localized = useLocalized()

const homePath = computed(() => (props.side === 'admin' ? '/admin/' : '/'))
const subtitle = computed(() => t(props.side === 'admin' ? 'header.adminSubtitle' : 'header.customerSubtitle'))
</script>

<template>
  <header
    id="site-header"
    class="border-b border-line bg-card"
  >
    <div class="page-container flex min-h-16 items-center gap-3">
      <NuxtLink
        :to="homePath"
        class="mr-auto inline-flex min-h-11 flex-col justify-center leading-[1.2] text-text no-underline"
      >
        <span class="font-heading text-[22px] font-semibold">{{ localized(site.name) }}</span>
        <span class="text-[13px] text-text-muted">{{ subtitle }}</span>
      </NuxtLink>
    </div>
  </header>
</template>
