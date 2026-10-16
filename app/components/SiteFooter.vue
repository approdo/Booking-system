<script setup lang="ts">
import { site } from '~/data/site'

/**
 * The footer of every booking page (spec section 6): the demo line (N9, switched by site.demoNotice),
 * the way into the back office with the demo account, and where the photos come from.
 * Dark background, so the focus ring is light gold (.on-dark, main.css).
 */
const { t } = useI18n()
const localized = useLocalized()
</script>

<template>
  <footer
    id="site-footer"
    class="on-dark bg-deeper py-[18px] text-[14px] text-on-deep-muted"
  >
    <div class="page-container flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
      <p
        v-if="site.demoNotice"
        id="site-demo-notice"
      >
        <PhraseText :text="localized(site.demoNoticeText)" />
      </p>
      <p>
        {{ t('footer.forShop') }}{{ ' ' }}<NuxtLink
          to="/admin/login/"
          class="inline-flex min-h-11 items-center whitespace-nowrap text-on-deep underline underline-offset-3"
        >
          {{ t('footer.adminLink') }}
        </NuxtLink>{{ ' · ' }}<span class="whitespace-nowrap">{{ t('footer.photoCredit') }}</span>
      </p>
    </div>
  </footer>
</template>
