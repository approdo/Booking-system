<script setup lang="ts">
/**
 * The back office's part of the header row (spec section 3, AppHeader): the tabs (1024px and wider), the
 * "บัญชีทดลอง" label, and "ออกจากระบบ", which ends the session (the sandbox and its data stay) and goes to
 * the login page.
 */
const { logout } = useAdminSession()
const signingOut = ref(false)

async function signOut() {
  if (signingOut.value) return
  signingOut.value = true
  await logout()
  signingOut.value = false
}
</script>

<template>
  <AdminTabs placement="top" />
  <span class="rounded-button border border-gold px-2.5 text-[13px] font-semibold whitespace-nowrap text-gold-ink">
    บัญชีทดลอง
  </span>
  <UiIconButton
    icon="out"
    label="ออกจากระบบ"
    :disabled="signingOut"
    @click="signOut"
  />
</template>
