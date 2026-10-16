<script setup lang="ts">
import { demoAccount } from '~/data/demoAccount'
import type { ThaiText } from '~/types/content'
import { ADMIN_HOME_PATH, safeNextPath } from '~/utils/adminNav'
import { stateMessages } from '~/utils/bookingRepository'
import { bannerFor, invalidCredentialsBanner, preparingLabel, signedOutBanner, stateBanners } from '~/utils/statusBanners'
import type { BannerContent } from '~/utils/statusBanners'

// The back office's login page (spec section 7, design B): the demo account is shown on the page on purpose
// (D-004), with one button that signs in with it, and the two lines that say what happens to what the visitor
// changes. Below it the usual form. The first sign-in of a browser creates its sandbox, so the button then says
// "กำลังเตรียมข้อมูลตัวอย่าง…" (spec section 5, preparing). Afterwards the page goes on to `next` (a page of the
// back office only) or the first tab. A visitor who is signed in already never sees this page
// (app/middleware/admin-access.global.ts). noindex: app.vue.
definePageMeta({ layout: 'admin-login' })
useSeoMeta({ title: pageTitle('admin', 'เข้าสู่ระบบ') })

const router = useRouter()
const { repository, notice } = useAdminSession()
const { clear: forgetBookings } = useAdminBookings()
const announce = useAnnounce()
const imageUrl = useImageUrl()

const loginImage = { file: 'why.webp', width: 600, height: 800 }

const email = ref('')
const password = ref('')
const errors = reactive<{ email: ThaiText | null, password: ThaiText | null }>({ email: null, password: null })
const emailField = ref<{ focus: () => void } | null>(null)
const passwordField = ref<{ focus: () => void } | null>(null)

/** Which button is signing in, and what it says meanwhile. */
const busy = ref<'demo' | 'form' | null>(null)
const busyLabel = ref<ThaiText>('')
/** A failed sign-in with the demo button (above the demo account) or with the form (above its button). */
const demoFailure = ref<BannerContent | null>(null)
const formFailure = ref<BannerContent | null>(null)

/** Why the page is shown again, said once above the demo account. */
const noticeBanner = computed(() => {
  if (notice.value === 'sandbox_expired') return stateBanners.sandbox_expired
  if (notice.value === 'signed_out') return signedOutBanner
  return null
})

// Values typed before the page came to life (lesson G-035): Vue would empty the fields while hydrating.
onBeforeMount(() => {
  email.value = document.querySelector<HTMLInputElement>('#login-email')?.value ?? ''
  password.value = document.querySelector<HTMLInputElement>('#login-password')?.value ?? ''
})

watch(email, () => {
  errors.email = null
})
watch(password, () => {
  errors.password = null
})

async function signIn(source: 'demo' | 'form', account: { email: string, password: string }) {
  if (busy.value) return
  demoFailure.value = null
  formFailure.value = null
  const preparing = repository.willPrepareSandbox()
  busyLabel.value = preparing ? preparingLabel : 'กำลังเข้าสู่ระบบ…'
  if (preparing) announce(stateMessages.preparing.text)
  busy.value = source
  const result = await repository.login(account.email, account.password)
  busy.value = null

  if (result.ok) {
    notice.value = null
    forgetBookings()
    await navigateTo(safeNextPath(router.currentRoute.value.query.next) ?? ADMIN_HOME_PATH, { replace: true })
    return
  }
  const failure = result.state === 'invalid_credentials' ? invalidCredentialsBanner : bannerFor(result.state)
  if (source === 'demo') demoFailure.value = failure
  else formFailure.value = failure
}

function signInWithDemo() {
  signIn('demo', demoAccount)
}

function submitForm() {
  errors.email = email.value.trim() === '' ? 'กรุณากรอกอีเมล' : null
  errors.password = password.value === '' ? 'กรุณากรอกรหัสผ่าน' : null
  if (errors.email || errors.password) {
    nextTick(() => (errors.email ? emailField : passwordField).value?.focus())
    return
  }
  signIn('form', { email: email.value, password: password.value })
}

function retry(source: 'demo' | 'form') {
  if (source === 'demo') signInWithDemo()
  else submitForm()
}
</script>

<template>
  <div class="grid min-h-dvh lg:grid-cols-2">
    <div class="relative hidden bg-deep lg:block">
      <img
        :src="imageUrl(loginImage)"
        alt=""
        :width="loginImage.width"
        :height="loginImage.height"
        loading="lazy"
        class="absolute inset-0 size-full object-cover"
      >
      <div class="absolute right-10 bottom-10 left-10 rounded-card bg-deep px-6 py-[22px] text-on-deep">
        <p class="font-heading text-[30px] leading-[1.2] font-semibold">
          นวลไพล
        </p>
        <p class="mt-1.5 text-[15px] text-on-deep-muted">
          <PhraseText :text="['หลังบ้านร้าน ', '— ดูคิว ', 'เปลี่ยนสถานะ ', 'และตั้งเวลาร้าน', 'ได้จากมือถือ']" />
        </p>
      </div>
    </div>

    <div class="flex flex-col">
      <div class="bg-deep px-4 py-5 text-on-deep lg:hidden">
        <p class="font-heading text-[26px] leading-[1.2] font-semibold">
          นวลไพล
        </p>
        <p class="text-[14px] text-on-deep-muted">
          หลังบ้านร้าน
        </p>
      </div>

      <div class="grid flex-1 content-center px-4 pt-7 pb-10">
        <div class="mx-auto w-full max-w-[420px]">
          <h1 class="text-[28px]">
            เข้าสู่ระบบ
          </h1>
          <p class="mt-0.5 mb-5 text-text-muted">
            สำหรับเจ้าของร้านและพนักงาน
          </p>

          <UiStatusBanner
            v-if="noticeBanner"
            class="mb-4"
            v-bind="noticeBanner"
          />
          <UiStatusBanner
            v-if="demoFailure"
            class="mb-4"
            focus-on-mount
            :variant="demoFailure.variant"
            :title="demoFailure.title"
            :text="demoFailure.text"
            :retry="demoFailure.retry"
            @retry="retry('demo')"
          />

          <section
            id="demo-account"
            aria-labelledby="demo-account-title"
            class="rounded-card border-2 border-accent bg-card p-[18px] shadow-card"
          >
            <p class="text-[13px] font-semibold tracking-[.08em] text-gold-ink">
              บัญชีทดลอง
            </p>
            <h2
              id="demo-account-title"
              class="mt-0.5 mb-2 text-[20px]"
            >
              ลองใช้หลังบ้านได้เลย
            </h2>
            <dl class="mb-3.5 grid grid-cols-[auto_1fr] gap-x-3 text-[15px]">
              <dt class="text-text-muted">
                อีเมล
              </dt>
              <dd class="font-semibold break-all">
                {{ demoAccount.email }}
              </dd>
              <dt class="text-text-muted">
                รหัสผ่าน
              </dt>
              <dd class="font-semibold break-all">
                {{ demoAccount.password }}
              </dd>
            </dl>
            <UiButton
              block
              :busy="busy === 'demo'"
              :busy-label="busyLabel"
              :disabled="busy === 'form'"
              @click="signInWithDemo"
            >
              เข้าด้วยบัญชีทดลอง
            </UiButton>
            <p class="mt-2.5 text-center text-[14px] text-text-muted">
              <PhraseText :text="['สิ่งที่คุณแก้', 'เห็นเฉพาะใน browser นี้ ', 'และถูกลบ', 'ภายใน 24 ชั่วโมง']" />
            </p>
            <p class="text-center text-[14px] text-text-muted">
              <PhraseText :text="['ห้ามกรอกข้อมูลจริง', 'ในหลังบ้านทดลอง']" />
            </p>
          </section>

          <p
            class="mt-[22px] mb-3.5 flex items-center gap-3 text-[14px] text-text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line"
          >
            หรือกรอกเอง
          </p>

          <form
            id="login-form"
            method="dialog"
            novalidate
            class="grid gap-4"
            @submit.prevent="submitForm"
          >
            <UiTextField
              id="login-email"
              ref="emailField"
              v-model="email"
              type="email"
              label="อีเมล"
              autocomplete="off"
              placeholder="name@example.com"
              :error="errors.email"
            />
            <UiTextField
              id="login-password"
              ref="passwordField"
              v-model="password"
              type="password"
              label="รหัสผ่าน"
              autocomplete="off"
              :error="errors.password"
            />
            <UiStatusBanner
              v-if="formFailure"
              focus-on-mount
              :variant="formFailure.variant"
              :title="formFailure.title"
              :text="formFailure.text"
              :retry="formFailure.retry"
              @retry="retry('form')"
            />
            <UiButton
              type="submit"
              variant="outline"
              block
              :busy="busy === 'form'"
              :busy-label="busyLabel"
              :disabled="busy === 'demo'"
            >
              เข้าสู่ระบบ
            </UiButton>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
