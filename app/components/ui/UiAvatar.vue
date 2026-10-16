<script setup lang="ts">
/**
 * A round letter avatar of a therapist (spec section 3): the first letter on accent-soft. `any` is
 * "ไม่ระบุ" (no preference): the sparkle icon on surface (C5). Decorative: the name is next to it.
 */
const props = withDefaults(defineProps<{ initial?: string, any?: boolean, size?: 28 | 44 | 56 }>(), { initial: '', size: 56 })

const sizeClass = computed(() => ({ 28: 'size-7 text-[13px]', 44: 'size-11 text-[19px]', 56: 'size-14 text-[24px]' }[props.size]))
const iconSize = computed(() => Math.round(props.size * 0.46))
</script>

<template>
  <span
    aria-hidden="true"
    :class="[
      'grid shrink-0 place-items-center rounded-full font-heading leading-none font-semibold text-accent-hover',
      any ? 'bg-surface' : 'bg-accent-soft',
      sizeClass,
    ]"
  >
    <UiIcon
      v-if="any"
      name="any"
      :size="iconSize"
    />
    <template v-else>{{ initial }}</template>
  </span>
</template>
