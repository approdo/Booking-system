<script setup lang="ts">
import type { ThaiText } from '~/types/content'

/**
 * A labelled text input (spec section 3, Field): the label above (a required field shows "*" and says
 * "(จำเป็น)" to screen readers), the input 48px high with 16px text (N7), then the error and the hint.
 * An error gives a 2px danger border, a light red background and aria-invalid; the error and the hint
 * are linked to the input with aria-describedby.
 *
 * `type` gives an email, password or date input; `multiline` a textarea (a service's description).
 * `hideLabel` keeps the label for screen readers only, where a row of fields has one visible heading.
 */
const props = withDefaults(defineProps<{
  id: string
  label: string
  type?: 'text' | 'email' | 'password' | 'date'
  multiline?: boolean
  hideLabel?: boolean
  required?: boolean
  error?: ThaiText | null
  hint?: ThaiText | null
  inputmode?: 'text' | 'tel' | 'email' | 'numeric'
  autocomplete?: string
  placeholder?: string
  min?: string
  max?: string
  maxlength?: number
}>(), {
  type: 'text',
  error: null,
  hint: null,
  inputmode: undefined,
  autocomplete: undefined,
  placeholder: undefined,
  min: undefined,
  max: undefined,
  maxlength: undefined,
})

const value = defineModel<string>({ default: '' })

const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)
const errorId = computed(() => `${props.id}-error`)
const hintId = computed(() => `${props.id}-hint`)
const describedBy = computed(() => [props.error ? errorId.value : '', props.hint ? hintId.value : ''].filter(Boolean).join(' ') || undefined)

const fieldClasses = computed(() => [
  'w-full rounded-input text-[16px] text-text placeholder:text-text-muted focus-visible:border-accent',
  'transition-[color,background-color,border-color]',
  props.multiline ? 'min-h-24 resize-y py-2.5 leading-normal' : 'min-h-12',
  props.error ? 'border-2 border-danger bg-danger-tint px-[13px]' : 'border border-text-muted bg-white px-3.5 hover:border-text',
])

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="grid gap-1.5">
    <label
      :for="id"
      :class="hideLabel ? 'sr-only' : 'text-[15px] font-semibold'"
    >
      {{ label }}<template v-if="required">{{ ' ' }}<span
        class="text-accent"
        aria-hidden="true"
      >*</span><span class="sr-only">(จำเป็น)</span></template>
    </label>
    <textarea
      v-if="multiline"
      :id="id"
      ref="input"
      v-model="value"
      :name="id"
      rows="3"
      :maxlength="maxlength"
      :placeholder="placeholder"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="fieldClasses"
    />
    <input
      v-else
      :id="id"
      ref="input"
      v-model="value"
      :type="type"
      :name="id"
      :inputmode="inputmode"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :min="min"
      :max="max"
      :maxlength="maxlength"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :class="fieldClasses"
    >
    <p
      v-if="error"
      :id="errorId"
      class="flex items-start gap-1.5 text-[14px] leading-normal text-danger"
    >
      <UiIcon
        name="err"
        :size="18"
        class="mt-px"
      />
      <span><PhraseText :text="error" /></span>
    </p>
    <p
      v-if="hint"
      :id="hintId"
      class="text-[14px] text-text-muted"
    >
      <PhraseText :text="hint" />
    </p>
  </div>
</template>
