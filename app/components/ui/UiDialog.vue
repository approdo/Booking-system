<script setup lang="ts">
/**
 * A modal dialog (spec section 3, Dialog): the browser's own <dialog> opened with showModal(), so the page
 * behind it cannot be reached and Esc closes it. A card at most 560px wide (the width less 16px on each side
 * on phones) and 90% of the screen high, scrolling inside; a serif heading and a close button.
 *
 * Esc, the close button and a click on the dark backdrop all close it; the focus then goes back to the
 * button that opened it. On opening, the focus goes to the first field, or the close button without one.
 */
const props = defineProps<{ id: string, title: string }>()
const emit = defineEmits<{ close: [] }>()

const dialog = ref<HTMLDialogElement | null>(null)
let opener: HTMLElement | null = null

function open() {
  if (!dialog.value || dialog.value.open) return
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value.showModal()
  const firstField = dialog.value.querySelector<HTMLElement>('input, select, textarea')
  ;(firstField ?? dialog.value.querySelector<HTMLElement>(`#${props.id}-close`))?.focus()
}

function close() {
  dialog.value?.close()
}

/** The dialog has closed (any way): give the focus back. */
function onClose() {
  emit('close')
  opener?.focus()
  opener = null
}

/** A click on the backdrop lands on the <dialog> itself; clicks on its content land on the inner box. */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

defineExpose({ open, close })
</script>

<template>
  <dialog
    :id="id"
    ref="dialog"
    :aria-labelledby="`${id}-title`"
    class="m-auto max-h-[90dvh] w-[min(100%-32px,560px)] max-w-none overflow-y-auto overscroll-contain rounded-card bg-card p-0 text-text backdrop:bg-deeper/55"
    @close="onClose"
    @click="onClick"
  >
    <div class="px-[18px] pt-3 pb-5 md:px-6">
      <div class="flex items-center justify-between gap-3">
        <h2
          :id="`${id}-title`"
          class="text-[20px]"
        >
          {{ title }}
        </h2>
        <UiIconButton
          :id="`${id}-close`"
          icon="close"
          label="ปิด"
          @click="close"
        />
      </div>
      <div class="mt-3">
        <slot />
      </div>
    </div>
  </dialog>
</template>
