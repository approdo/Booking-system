<script setup lang="ts">
// The back office's entry (spec section 2). It is never shown for long: in the browser
// app/middleware/admin-access.global.ts sends the visitor on to the first tab, or to the login page without a
// session. The pre-rendered page says where it leads, for a browser without JavaScript. noindex: app.vue.
import { LOGIN_PATH } from '~/utils/adminNav'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin') })
</script>

<template>
  <div class="page-container">
    <h1 class="text-[28px]">
      หลังบ้าน
    </h1>
    <p class="mt-2">
      <UiTextButton :to="LOGIN_PATH">
        เข้าสู่ระบบ
      </UiTextButton>
    </p>
  </div>
</template>
