<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <!--
    First link on the page: keyboard users can jump over the header to the main content.
    It stays above the top edge of the screen until it has focus.
  -->
  <a
    href="#main"
    class="absolute -top-25 left-3 z-100 rounded-input bg-accent px-4 py-3 font-semibold text-white no-underline focus:top-3"
  >{{ t('skipLink') }}</a>
</template>
