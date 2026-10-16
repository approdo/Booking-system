import tailwindcss from '@tailwindcss/vite'
import { site } from './app/data/site'
import { homePaths, siteLocales } from './app/utils/locales'

// The site is served under a sub-path, '/Booking-system/' on GitHub Pages (or at the root of a
// client's own domain, '/'). The path is taken from the site URL and set here on purpose,
// not through NUXT_APP_BASE_URL: Git Bash on Windows rewrites environment values that start
// with '/' into Windows paths (lesson G-001).
const siteUrl = new URL(site.url)
const baseURL = siteUrl.pathname

// Thai only (N3): site.english is false, so there are no /en/ pages and no English hreflang link.
const locales = siteLocales(site.english)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/fonts', '@nuxtjs/i18n'],
  devtools: { enabled: true },
  app: {
    baseURL,
    head: {
      link: [
        // Nuxt does not add the base URL to files in public/, so join it by hand (lesson G-020).
        // Without the apple-touch-icon link, iOS looks for the icon at the root of the domain,
        // outside the site's sub-path. Both files come from `npm run brand-images`.
        { rel: 'icon', type: 'image/svg+xml', href: `${baseURL}favicon.svg` },
        { rel: 'apple-touch-icon', href: `${baseURL}apple-touch-icon.png` },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      // The booking API's address (app/composables/useBookingRepository.ts). Public on purpose: the
      // browser calls it. NUXT_PUBLIC_API_BASE overrides it when generating.
      apiBase: site.apiUrl,
    },
  },
  experimental: {
    // Static pages without data fetching: skip the separate _payload.json request.
    payloadExtraction: false,
  },
  compatibilityDate: '2026-09-27',
  nitro: {
    prerender: {
      // Write the home page of every language and the back office's entry, whether or not some page links
      // to them; the crawler adds the pages they link to.
      routes: [...homePaths(locales), '/admin/'],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  typescript: {
    // `npm run typecheck` also checks the tests, the scripts' TypeScript helpers and the test runner configs.
    nodeTsConfig: {
      include: ['../tests/**/*', '../scripts/**/*.ts', '../vitest.config.ts', '../playwright.config.ts', '../playwright.live.config.ts'],
    },
  },
  eslint: {
    // Also check formatting (2-space indent, single quotes, no semicolons).
    config: { stylistic: true },
  },
  fonts: {
    // The fonts are named in app/assets/css/tokens.css (--font-body, --font-heading); @nuxt/fonts
    // downloads them at build time and serves them from this site, so visitors never connect to
    // Google Fonts. Only three weights are downloaded, to keep the font files small on phones
    // (spec section 1): body text 400 and 600 (site.fontWeights), headings 600.
    families: [
      { name: 'Noto Sans Thai', weights: [...site.fontWeights] },
      { name: 'Noto Serif Thai', weights: [600] },
    ],
    defaults: {
      styles: ['normal'],
      subsets: ['thai', 'latin'],
      preload: true,
    },
  },
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'th',
    locales,
    // A static site has no server to redirect by the browser's language.
    detectBrowserLanguage: false,
    // Links end with '/', like the folders that `nuxt generate` writes (admin/index.html),
    // so static hosts serve them without a redirect.
    trailingSlash: true,
    // Origin for the absolute URL of the canonical link; the base path is added by the router.
    baseUrl: siteUrl.origin,
  },
})
