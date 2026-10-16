<script setup lang="ts">
import { seed } from '~/data/seed'
import type { ThaiText } from '~/types/content'
import { withService } from '~/utils/bookingDraft'
import { bannerFor, stateBanners } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'
import { choiceValue, findChoice, servicesFromCategories } from '~/utils/serviceChoices'
import type { ServiceChoice } from '~/utils/serviceChoices'

// Step 1 of the booking, "choose a service" (spec section 6). The heading, the categories and their photos
// are static, and the services are drawn from the starting data (app/data/seed.ts, the same file the back
// end copies into every sandbox), so all of it is in the generated HTML before any request (spec D8).
// In the browser the list is refreshed from the API without a word: it is the visitor's own data once they
// have a sandbox, and then a skeleton stands in until it arrives. Reading never writes (D-008 ข).
const heading = ref<HTMLElement | null>(null)
const { draft, save } = useBookingStep(1, heading)
const repository = useBookingRepository()
const imageUrl = useImageUrl()

const startingServices = servicesFromCategories(seed.serviceCategories)
const services = ref<ServiceChoice[]>(startingServices)
/** ready: the list is shown · loading: the visitor's own list is on its way · failed: it could not be read. */
const listState = ref<'ready' | 'loading' | 'failed'>('ready')
const failure = ref<BannerContent | null>(null)
const expired = ref(false)
const chosen = ref<string | null>(null)

const categories = computed(() => seed.serviceCategories
  .map(category => ({ ...category, services: services.value.filter(service => service.categoryId === category.id) }))
  // A category without a service open for booking is hidden; while loading every category shows.
  .filter(category => listState.value === 'loading' || category.services.length > 0))

const choice = computed(() => findChoice(services.value, chosen.value))

function choose(value: string) {
  chosen.value = value
  const found = findChoice(services.value, value)
  if (!found) return
  save(withService(draft.value, { id: found.service.id, name: found.service.name, minutes: found.option.minutes, price: found.option.price }))
}

/** After a refresh: keep the chosen length if it is still offered (with its current price), else forget it. */
function keepChoiceInList() {
  if (!chosen.value) return
  if (findChoice(services.value, chosen.value)) choose(chosen.value)
  else {
    chosen.value = null
    save({})
  }
}

async function loadServices(): Promise<void> {
  const ownData = !repository.willPrepareSandbox()
  if (ownData) listState.value = 'loading'
  const result = await repository.getShop()
  if (result.ok) {
    services.value = result.data.services
    listState.value = 'ready'
    failure.value = null
    keepChoiceInList()
    return
  }
  if (result.state === 'sandbox_expired') {
    // The adapter has dropped the old token: say so, and show the starting data again.
    expired.value = true
    services.value = startingServices
    listState.value = 'ready'
    return loadServices()
  }
  // Without a sandbox the starting data is already on the screen, so a failed refresh changes nothing.
  if (ownData) {
    listState.value = 'failed'
    failure.value = bannerFor(result.state)
  }
}

// A length tapped before the page came to life (lesson G-035): Vue would uncheck it while hydrating.
let tappedBeforeHydration: string | null = null
onBeforeMount(() => {
  tappedBeforeHydration = document.querySelector<HTMLInputElement>('input[name="option"]:checked')?.value ?? null
})

onMounted(() => {
  const saved = draft.value.service ? choiceValue(draft.value.service.id, draft.value.service.minutes) : null
  const initial = tappedBeforeHydration ?? saved
  if (initial && findChoice(services.value, initial)) choose(initial)
  loadServices()
})

const summary = computed<ThaiText>(() => {
  const found = choice.value
  return found ? [`${found.service.name} · `, `${found.option.minutes} นาที`] : 'ยังไม่ได้เลือกบริการ'
})

function next() {
  navigateTo('/therapist/')
}
</script>

<template>
  <div>
    <div class="mx-auto w-[min(100%-32px,760px)] pt-4 pb-9 md:pt-6">
      <h1
        ref="heading"
        tabindex="-1"
        class="text-[clamp(28px,6vw,40px)]"
      >
        <PhraseText :text="['เลือกบริการ']" />
      </h1>
      <p class="mt-1.5 text-text-muted">
        <PhraseText :text="['แตะระยะเวลาที่ต้องการ ', 'ราคารวมทุกอย่างแล้ว ', 'จ่ายที่ร้าน']" />
      </p>

      <UiStatusBanner
        v-if="expired"
        class="mt-5"
        v-bind="stateBanners.sandbox_expired"
      />

      <UiStatusBanner
        v-if="listState === 'failed' && failure"
        class="mt-6"
        :variant="failure.variant"
        :title="failure.title"
        :text="failure.text"
        :retry="failure.retry"
        @retry="loadServices"
      />
      <UiEmptyState
        v-else-if="categories.length === 0"
        class="mt-6"
        :text="['ตอนนี้ยังไม่มีบริการ', 'ที่เปิดรับจอง']"
      />
      <template v-else>
        <section
          v-for="(category, index) in categories"
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

          <UiLoading v-if="listState === 'loading'">
            <div class="grid gap-3">
              <div
                v-for="placeholder in 2"
                :key="placeholder"
                class="skeleton h-[168px] rounded-card md:h-[150px]"
              />
            </div>
          </UiLoading>
          <ul
            v-else
            role="list"
            class="grid gap-3"
          >
            <BookingServiceCard
              v-for="service in category.services"
              :key="service.id"
              :service="service"
              :chosen="chosen"
              @choose="choose"
            />
          </ul>
        </section>
      </template>
    </div>

    <BookingActionBar
      :summary="summary"
      :price="choice?.option.price ?? null"
      label="ถัดไป"
      icon="right"
      :blocked-reason="choice ? null : 'เลือกระยะเวลาของบริการก่อน'"
      @next="next"
    />
  </div>
</template>
