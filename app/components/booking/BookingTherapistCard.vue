<script setup lang="ts">
/**
 * A choice on the therapist screen (spec section 6, ChoiceCard): the whole card is a radio of the group
 * "therapist". "ไม่ระบุ" (no preference) has the sparkle avatar. The radio's name is the person's name; the
 * role, years and specialty describe it. A chosen card gets the accent border and a ticked circle.
 */
const props = defineProps<{
  value: string
  name: string
  initial?: string
  any?: boolean
  /** 'ผู้ก่อตั้ง · หมอนวดอาวุโส · 22 ปี', or the description of "ไม่ระบุ". */
  detail: string
  /** Phrases (lesson G-007). */
  specialty?: readonly string[]
  chosen: boolean
}>()

defineEmits<{ choose: [value: string] }>()

const detailId = computed(() => `therapist-${props.value}-detail`)
</script>

<template>
  <label class="choice-card relative flex min-h-[92px] items-center gap-3.5 py-4 pr-12 pl-[18px]">
    <input
      type="radio"
      name="therapist"
      class="sr-only"
      :value="value"
      :checked="chosen"
      :aria-label="name"
      :aria-describedby="detailId"
      @change="$emit('choose', value)"
    >
    <UiAvatar
      :initial="initial"
      :any="any"
      :size="56"
    />
    <span class="min-w-0">
      <span class="block font-heading text-[19px] leading-[1.35] font-semibold">{{ name }}</span>
      <span
        :id="detailId"
        class="block text-[14px] leading-normal text-text-muted"
      >
        <span class="block">{{ detail }}</span>
        <span
          v-if="specialty"
          class="block"
        ><PhraseText :text="specialty" /></span>
      </span>
    </span>
    <span
      v-if="chosen"
      aria-hidden="true"
      class="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-full bg-accent text-white"
    >
      <UiIcon
        name="check"
        :size="16"
        :stroke-width="2.4"
      />
    </span>
  </label>
</template>
