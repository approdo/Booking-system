<script setup lang="ts">
import { site } from '~/data/site'
import { BOOKING_STEPS, bookingStep, bookingStepNumber } from '~/utils/bookingSteps'
import type { SiteSide } from '~/utils/pageTitle'

/**
 * The header of every page (spec section 3, AppHeader): the shop name and the side under it.
 * The logo leads to the start of the booking (the draft stays), or to the back office's first page.
 * On a booking screen it also shows "ขั้น N จาก 5" (with the screen's name below 768px) and the
 * progress bar.
 */
const props = defineProps<{ side: SiteSide }>()

const { t } = useI18n()
const localized = useLocalized()
const route = useRoute()

const homePath = computed(() => (props.side === 'admin' ? '/admin/' : '/'))
const subtitle = computed(() => t(props.side === 'admin' ? 'header.adminSubtitle' : 'header.customerSubtitle'))
const step = computed(() => (props.side === 'customer' ? bookingStepNumber(route.path) : null))
</script>

<template>
  <header
    id="site-header"
    class="border-b border-line bg-card"
  >
    <div class="page-container">
      <div class="flex min-h-16 items-center gap-3">
        <NuxtLink
          :to="homePath"
          class="mr-auto inline-flex min-h-11 flex-col justify-center leading-[1.2] text-text no-underline"
        >
          <span class="font-heading text-[22px] font-semibold">{{ localized(site.name) }}</span>
          <span class="text-[13px] text-text-muted">{{ subtitle }}</span>
        </NuxtLink>
        <p
          v-if="step"
          class="text-right text-[14px] leading-[1.4] text-text-muted"
        >
          <strong class="font-semibold whitespace-nowrap text-text">ขั้น {{ step }} จาก {{ BOOKING_STEPS.length }}</strong>
          <span class="block md:hidden">{{ bookingStep(step).title }}</span>
        </p>
      </div>
      <BookingProgress
        v-if="step"
        :current="step"
      />
    </div>
  </header>
</template>
