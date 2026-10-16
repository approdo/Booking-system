<template>
  <div class="flex min-h-dvh flex-col">
    <!-- The booking pages (spec section 6): header, the screen, footer. -->
    <SkipLink />
    <AppHeader side="customer" />
    <main
      id="main"
      class="flex-1"
    >
      <slot />
    </main>
    <SiteFooter />
    <!-- The layout's one polite live region (spec section 9): app/composables/useAnnounce.ts. -->
    <NuxtAnnouncer />
  </div>
</template>
