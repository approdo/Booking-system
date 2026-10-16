<script setup lang="ts">
/**
 * The container of skeleton boxes while data loads (spec section 3, Skeleton): aria-busy, and
 * "กำลังโหลด…" for screen readers. Put boxes inside with class="skeleton" and a fixed size, so nothing
 * above the list moves when the data arrives.
 */
</script>

<template>
  <div aria-busy="true">
    <span class="sr-only">กำลังโหลด…</span>
    <div aria-hidden="true">
      <slot />
    </div>
  </div>
</template>
