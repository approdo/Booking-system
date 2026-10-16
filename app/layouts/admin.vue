<script setup lang="ts">
/**
 * The back office (spec section 7): header (with the tabs from 1024px), the page, and below 1024px the tab
 * bar stuck to the bottom of the screen. No footer; every page is noindex (app.vue). The number on the
 * "การจอง" tab needs the bookings, so they are loaded once here if no page has loaded them yet.
 */
const { list, load } = useAdminBookings()
const repository = useBookingRepository()

onMounted(() => {
  if (!list.value && repository.hasSession()) load()
})
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <SkipLink />
    <AppHeader side="admin" />
    <main
      id="main"
      class="flex-1 pt-5 pb-8 lg:pt-7 lg:pb-12"
    >
      <slot />
    </main>
    <AdminTabs placement="bottom" />
    <!-- The layout's one polite live region (spec section 9): app/composables/useAnnounce.ts. -->
    <NuxtAnnouncer />
  </div>
</template>
