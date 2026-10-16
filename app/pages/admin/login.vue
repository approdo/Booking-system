<script setup lang="ts">
// The back office's login page (spec section 7). A placeholder until the back office is built (BK-007),
// so that the footer's link into the back office leads somewhere. noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'เข้าสู่ระบบ') })
</script>

<template>
  <div class="mx-auto w-[min(100%-32px,420px)] py-6">
    <h1 class="text-[28px]">
      เข้าสู่ระบบ
    </h1>
    <p class="text-[14px] text-text-muted">
      สำหรับเจ้าของร้านและพนักงาน
    </p>
  </div>
</template>
