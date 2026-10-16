<script setup lang="ts">
import { serviceCategories } from '~/data/services'

// Step 1 of the booking, "choose a service" (spec section 6). The heading, the categories and their
// photos are static, so they are in the generated HTML before any request to the back end (spec D8).
// The services are listed from the starting data; choosing one is added with the booking flow (BK-006).
useSeoMeta({ title: pageTitle('customer', 'เลือกบริการ') })

const imageUrl = useImageUrl()
</script>

<template>
  <div class="mx-auto w-[min(100%-32px,760px)] pt-4 pb-9 md:pt-6">
    <h1 class="text-[clamp(28px,6vw,40px)]">
      <PhraseText :text="['เลือกบริการ']" />
    </h1>
    <p class="mt-1.5 text-text-muted">
      <PhraseText :text="['แตะระยะเวลาที่ต้องการ ', 'ราคารวมทุกอย่างแล้ว ', 'จ่ายที่ร้าน']" />
    </p>

    <section
      v-for="(category, index) in serviceCategories"
      :key="category.id"
      class="mt-6"
      :aria-labelledby="`category-${category.id}`"
    >
      <div class="mb-3 flex items-center gap-3.5">
        <img
          :src="imageUrl(category.image)"
          alt=""
          :width="category.image.width"
          :height="category.image.height"
          :loading="index === 0 ? 'eager' : 'lazy'"
          class="h-16 w-13 shrink-0 rounded-arch object-cover"
        >
        <div>
          <h2
            :id="`category-${category.id}`"
            class="text-[22px]"
          >
            {{ category.name }}
          </h2>
          <p class="text-[14px] leading-normal text-text-muted">
            {{ category.description }}
          </p>
        </div>
      </div>

      <ul
        role="list"
        class="grid gap-3"
      >
        <li
          v-for="item in category.items"
          :key="item.id"
          class="rounded-card border-[1.5px] border-line bg-card p-[18px]"
        >
          <h3 class="text-[19px]">
            {{ item.name }}
          </h3>
          <p class="text-[15px] text-text-muted">
            {{ item.description }}
          </p>
          <p
            v-if="item.includes"
            class="text-[14px] text-text-muted"
          >
            รวม: {{ item.includes }}
          </p>
          <p class="mt-2 flex flex-wrap gap-x-4 text-[14px]">
            <span
              v-for="option in item.options"
              :key="option.minutes"
              class="whitespace-nowrap"
            >
              <span class="text-text-muted">{{ option.minutes }} นาที</span>{{ ' · ' }}<strong class="font-semibold">{{ formatNumber(option.price) }} บาท</strong>
            </span>
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
