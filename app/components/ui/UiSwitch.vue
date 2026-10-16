<script setup lang="ts">
/**
 * An on / off switch (spec section 3, Switch): a real checkbox with role="switch", 46 × 28, and its label on
 * the right, in a row at least 44px high. Off: muted border and knob on white; on: accent with a white knob.
 * `busy` (aria-busy) while the change is being saved; a press does nothing then.
 *
 * `hiddenLabel` is said to screen readers after the label, to tell apart switches that look the same:
 * "รับจอง" + " นวดแผนไทย".
 */
const props = defineProps<{
  id: string
  label: string
  hiddenLabel?: string
  busy?: boolean
}>()

const checked = defineModel<boolean>({ default: false })

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (props.busy) {
    input.checked = checked.value
    return
  }
  checked.value = input.checked
}
</script>

<template>
  <label
    :for="id"
    class="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]"
  >
    <input
      :id="id"
      type="checkbox"
      role="switch"
      class="switch"
      :checked="checked"
      :aria-busy="busy ? 'true' : undefined"
      @change="onChange"
    >
    <span>{{ label }}<span
      v-if="hiddenLabel"
      class="sr-only"
    >{{ ` ${hiddenLabel}` }}</span></span>
  </label>
</template>
