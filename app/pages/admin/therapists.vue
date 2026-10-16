<script setup lang="ts">
import type { Therapist } from '~/types/api'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// "ตั้งค่าร้าน" › "ตารางงานหมอนวด" (spec section 7, design B — BK-010): a card per therapist with the days of
// the week they work and their leave dates, each saved at once. On a day a therapist does not work, the
// customer who chose them sees the day as "หยุด", and "ไม่ระบุ" counts only those who work (BK-010 AC1). No
// hours per therapist (out of scope). noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'ตารางงานหมอนวด') })

const { repository, leaveIfSignedOut } = useAdminSession()

const therapists = ref<Therapist[]>([])
const today = ref('')
const listState = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<BannerContent | null>(null)

async function loadTherapists() {
  listState.value = 'loading'
  const result = await repository.getAdminShop()
  if (result.ok) {
    therapists.value = result.data.therapists
    today.value = result.data.today
    listState.value = 'ready'
    failure.value = null
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  listState.value = 'failed'
  failure.value = bannerFor(result.state)
}

onMounted(loadTherapists)

/** A therapist saved by their card, in place of the old one. */
function keepTherapist(therapist: Therapist) {
  therapists.value = therapists.value.map(item => (item.id === therapist.id ? therapist : item))
}
</script>

<template>
  <div class="page-container">
    <AdminPageHead
      title="ตั้งค่าร้าน"
      :detail="['แตะวันเพื่อสลับ', 'วันทำงาน (เข้ม) ', '/ วันหยุด (ขาว)']"
    />
    <AdminSettingsNav />

    <UiLoading v-if="listState === 'loading'">
      <div class="grid gap-3 md:grid-cols-2">
        <div
          v-for="placeholder in 4"
          :key="placeholder"
          class="skeleton h-[244px] rounded-card"
        />
      </div>
    </UiLoading>
    <UiStatusBanner
      v-else-if="listState === 'failed' && failure"
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="loadTherapists"
    />
    <ul
      v-else
      role="list"
      class="grid gap-3 md:grid-cols-2"
    >
      <AdminTherapistCard
        v-for="therapist in therapists"
        :key="therapist.id"
        :therapist="therapist"
        :today="today"
        @updated="keepTherapist"
      />
    </ul>
  </div>
</template>
