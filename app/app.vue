<script setup lang="ts">
import { site } from '~/data/site'
import { isAdminPath } from '~/utils/pageTitle'

const localized = useLocalized()
const route = useRoute()

// <html lang>, the canonical link and og:url. All of them start with site.url.
const i18nHead = useLocaleHead()

// @nuxtjs/i18n writes the home page as '.../Booking-system', without the '/' that static hosts
// redirect to; give the canonical link and og:url the URL that is served as it is.
const siteUrlWithoutSlash = site.url.replace(/\/$/, '')
function withSlash<T>(url: T) {
  return url === siteUrlWithoutSlash ? site.url : url
}
const i18nLinks = computed(() => i18nHead.value.link?.map(link => ({ ...link, href: withSlash(link.href) })))
const i18nMeta = computed(() => i18nHead.value.meta?.map(meta => ({ ...meta, content: withSlash(meta.content) })))

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  link: i18nLinks.value,
  meta: [
    ...(i18nMeta.value ?? []),
    // The back office is not for search engines (N11).
    ...(isAdminPath(route.path) ? [{ name: 'robots', content: 'noindex' }] : []),
  ],
}))

// Default title and description, and the link preview (made by `npm run brand-images`). Each page sets
// its own title with pageTitle() (app/utils/pageTitle.ts). Open Graph needs an absolute URL; site.url
// already ends with the base path.
useSeoMeta({
  title: () => localized(site.name),
  description: () => localized(site.description),
  ogType: 'website',
  ogTitle: () => localized(site.name),
  ogDescription: () => localized(site.description),
  ogSiteName: () => localized(site.name),
  ogImage: `${site.url}og-image.png`,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => localized(site.name),
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
