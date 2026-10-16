<template>
  <div class="min-h-dvh">
    <!-- The back office's login page (spec section 7): no header, tab bar or footer. -->
    <main id="main">
      <slot />
    </main>
    <!-- The layout's one polite live region (spec section 9): app/composables/useAnnounce.ts. -->
    <NuxtAnnouncer />
  </div>
</template>
