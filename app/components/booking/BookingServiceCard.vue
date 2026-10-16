<script setup lang="ts">
import { formatPrice } from '~/utils/bookingFormat'
import { formatNumber } from '~/utils/numbers'
import { choiceValue } from '~/utils/serviceChoices'
import type { ServiceChoice } from '~/utils/serviceChoices'

/**
 * A service on the first booking screen (spec section 6, ChoiceCard): name, description, what a package
 * includes, and one tile per length. Every tile on the page is a radio of the one group "option"; its value
 * is '<service id>:<minutes>'. The card of the chosen length gets the accent border and "เลือกแล้ว".
 */
const props = defineProps<{ service: ServiceChoice, chosen: string | null }>()
defineEmits<{ choose: [value: string] }>()

const isChosen = computed(() => props.chosen?.startsWith(`${props.service.id}:`) ?? false)

function value(minutes: number) {
  return choiceValue(props.service.id, minutes)
}
</script>

<template>
  <li class="choice-card p-[18px]">
    <div class="flex items-baseline justify-between gap-3">
      <h3 class="text-[19px]">
        {{ service.name }}
      </h3>
      <span
        v-if="isChosen"
        class="inline-flex shrink-0 items-center gap-1 text-[14px] font-semibold whitespace-nowrap text-accent"
      >
        <UiIcon
          name="check"
          :size="18"
        />เลือกแล้ว
      </span>
    </div>
    <p class="mt-1 text-[15px] leading-[1.6] text-text-muted">
      {{ service.description }}
    </p>
    <p
      v-if="service.includes"
      class="mt-1 text-[14px] text-text-muted"
    >
      รวม: {{ service.includes }}
    </p>
    <div class="mt-3 grid grid-cols-3 gap-2 md:grid-cols-[repeat(4,minmax(0,150px))]">
      <label
        v-for="option in service.options"
        :key="option.minutes"
        class="choice-tile min-h-14 p-1.5"
      >
        <input
          type="radio"
          name="option"
          class="sr-only"
          :value="value(option.minutes)"
          :checked="chosen === value(option.minutes)"
          :aria-label="`${service.name} ${option.minutes} นาที ${formatNumber(option.price)} บาท`"
          @change="$emit('choose', value(option.minutes))"
        >
        <span class="tile-note text-[14px] whitespace-nowrap">{{ option.minutes }} นาที</span>
        <span class="font-semibold whitespace-nowrap">{{ formatPrice(option.price) }}</span>
      </label>
    </div>
  </li>
</template>
