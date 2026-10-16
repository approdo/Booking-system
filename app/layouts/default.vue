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
  </div>
</template>
