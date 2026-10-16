<script setup lang="ts">
import { seed } from '~/data/seed'
import type { Service } from '~/types/api'
import { bannerFor } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// "บริการและราคา" (spec section 7, design B): every service of the visitor's sandbox as cards, filtered by
// category, with "รับจอง" (saved at once) and "แก้ไข", and a last card "เพิ่มบริการ". A change shows on the
// customer's first screen in the same browser (BK-007 AC3). noindex: app.vue.
definePageMeta({ layout: 'admin' })
useSeoMeta({ title: pageTitle('admin', 'บริการและราคา') })

const { repository, leaveIfSignedOut } = useAdminSession()

const services = ref<Service[]>([])
const listState = ref<'loading' | 'ready' | 'failed'>('loading')
const failure = ref<BannerContent | null>(null)
const category = ref('all')
const dialog = ref<{ open: (service: Service | null, defaultCategory?: string) => void } | null>(null)

async function loadServices() {
  listState.value = 'loading'
  const result = await repository.getAdminShop()
  if (result.ok) {
    services.value = result.data.services
    listState.value = 'ready'
    failure.value = null
    return
  }
  if (await leaveIfSignedOut(result.state)) return
  listState.value = 'failed'
  failure.value = bannerFor(result.state)
}

onMounted(loadServices)

const categoryNames = Object.fromEntries(seed.serviceCategories.map(item => [item.id, item.name]))
const categoryOptions = computed(() => [
  { value: 'all', label: 'ทั้งหมด', count: listState.value === 'ready' ? services.value.length : null },
  ...seed.serviceCategories.map(item => ({
    value: item.id,
    label: item.name,
    count: listState.value === 'ready' ? services.value.filter(service => service.categoryId === item.id).length : null,
  })),
])
const shown = computed(() => (category.value === 'all' ? services.value : services.value.filter(service => service.categoryId === category.value)))

/** A service saved by its card or the form: in place of the old one, or at the end of the list. */
function keepService(service: Service, isNew = false) {
  services.value = isNew ? [...services.value, service] : services.value.map(item => (item.id === service.id ? service : item))
}

function openForm(service: Service | null) {
  dialog.value?.open(service, category.value)
}
</script>

<template>
  <div class="page-container">
    <AdminPageHead
      title="บริการและราคา"
      :detail="['ปิดรับจองชั่วคราวได้ ', 'โดยไม่ต้องลบบริการ']"
    />

    <UiFilterChips
      v-model="category"
      class="mb-3.5"
      label="หมวด"
      :options="categoryOptions"
    />

    <UiLoading v-if="listState === 'loading'">
      <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="placeholder in 3"
          :key="placeholder"
          class="skeleton h-[170px] rounded-card"
        />
      </div>
    </UiLoading>
    <UiStatusBanner
      v-else-if="listState === 'failed' && failure"
      :variant="failure.variant"
      :title="failure.title"
      :text="failure.text"
      :retry="failure.retry"
      @retry="loadServices"
    />
    <ul
      v-else
      role="list"
      class="grid gap-3 md:grid-cols-2 lg:grid-cols-3"
    >
      <AdminServiceCard
        v-for="service in shown"
        :key="service.id"
        :service="service"
        :category-name="categoryNames[service.categoryId] ?? ''"
        @updated="keepService"
        @edit="openForm"
      />
      <li>
        <button
          type="button"
          class="grid min-h-[140px] w-full place-items-center rounded-card border-2 border-dashed border-line font-semibold text-accent transition-[color,background-color,border-color] hover:border-text-muted"
          @click="openForm(null)"
        >
          <span class="inline-flex items-center gap-1.5">
            <UiIcon name="plus" />เพิ่มบริการ
          </span>
        </button>
      </li>
    </ul>

    <AdminServiceDialog
      ref="dialog"
      @saved="keepService"
    />
  </div>
</template>
