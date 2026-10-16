<script setup lang="ts">
import { seed } from '~/data/seed'
import type { ThaiText } from '~/types/content'
import { withTherapist } from '~/utils/bookingDraft'
import type { DraftTherapist } from '~/utils/bookingDraft'

// Step 2, "choose a therapist" (spec section 6): "ไม่ระบุ" (no preference) first, then the four therapists.
// Names, roles and specialties are the shop's starting data (the back office cannot change them), so this
// screen needs no request. The skeleton shows until the draft is read in the browser.
const heading = ref<HTMLElement | null>(null)
const { draft, ready, save } = useBookingStep(2, heading)

const ANY = 'any'
const anyTherapist: DraftTherapist = { id: null, name: 'ไม่ระบุ' }

const chosen = computed(() => {
  const therapist = draft.value.therapist
  return therapist ? (therapist.id ?? ANY) : null
})

function choose(value: string) {
  const therapist = seed.therapists.find(person => person.id === value)
  save(withTherapist(draft.value, therapist ? { id: therapist.id, name: therapist.name } : anyTherapist))
}

const summary = computed<ThaiText>(() => {
  const { service, therapist } = draft.value
  if (!service) return ''
  if (!therapist) return 'ยังไม่ได้เลือกหมอนวด'
  return [`${service.name} · `, `${service.minutes} นาที · `, therapist.name]
})
</script>

<template>
  <div>
    <div class="mx-auto w-[min(100%-32px,760px)] pt-4 pb-9 md:pt-6">
      <UiTextButton
        to="/"
        icon="left"
        muted
      >
        ย้อนกลับ
      </UiTextButton>
      <h1
        ref="heading"
        tabindex="-1"
        class="mt-0.5 text-[clamp(28px,6vw,40px)]"
      >
        <PhraseText :text="['เลือกหมอนวด']" />
      </h1>
      <p class="mt-1.5 text-text-muted">
        <PhraseText :text="['ไม่มีคนที่ชอบเป็นพิเศษ ', 'เลือก “ไม่ระบุ” ', 'แล้วร้านจะจัดคนที่ว่างให้ ', '— จะเห็นเวลาว่างมากที่สุด']" />
      </p>

      <UiLoading
        v-if="!ready"
        class="mt-6"
      >
        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="placeholder in 5"
            :key="placeholder"
            :class="['skeleton h-[92px] rounded-card', placeholder === 1 ? 'md:col-span-2' : '']"
          />
        </div>
      </UiLoading>
      <fieldset
        v-else
        class="mt-6"
      >
        <legend class="sr-only">
          หมอนวด
        </legend>
        <ul
          role="list"
          class="grid gap-3 md:grid-cols-2"
        >
          <li class="md:col-span-2">
            <BookingTherapistCard
              :value="ANY"
              :name="anyTherapist.name"
              any
              detail="ให้ร้านจัดหมอนวดที่ว่างในเวลาที่คุณเลือก"
              :chosen="chosen === ANY"
              @choose="choose"
            />
          </li>
          <li
            v-for="therapist in seed.therapists"
            :key="therapist.id"
          >
            <BookingTherapistCard
              :value="therapist.id"
              :name="therapist.name"
              :initial="therapist.initial"
              :detail="`${therapist.role} · ${therapist.years} ปี`"
              :specialty="therapist.specialty"
              :chosen="chosen === therapist.id"
              @choose="choose"
            />
          </li>
        </ul>
      </fieldset>
    </div>

    <BookingActionBar
      v-if="ready && draft.service"
      :summary="summary"
      :price="draft.service.price"
      label="ถัดไป"
      icon="right"
      :blocked-reason="draft.therapist ? null : 'เลือกหมอนวดก่อน'"
      @next="navigateTo('/time/')"
    />
  </div>
</template>
