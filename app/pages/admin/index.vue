<script setup lang="ts">
// The back office's entry (spec section 2). A placeholder until the back office is built (BK-007):
// then /admin/ leads to the first tab, or to the login page without a session. noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin') })
</script>

<template>
  <div class="page-container py-6">
    <h1 class="text-[28px]">
      หลังบ้าน
    </h1>
    <p class="text-[14px] text-text-muted">
      หลังบ้านร้าน — ดูคิว เปลี่ยนสถานะ และตั้งเวลาร้านได้จากมือถือ
    </p>
    <p class="mt-4">
      <NuxtLink
        to="/admin/login/"
        class="inline-flex min-h-11 items-center font-semibold text-accent no-underline hover:underline hover:underline-offset-3"
      >
        เข้าสู่ระบบ
      </NuxtLink>
    </p>
  </div>
</template>
