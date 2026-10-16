<template>
  <div class="min-h-dvh">
    <!-- The back office (spec section 7): header, then the page. No footer; every page is noindex (app.vue). -->
    <SkipLink />
    <AppHeader side="admin" />
    <main id="main">
      <slot />
    </main>
  </div>
</template>
