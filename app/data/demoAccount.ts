/**
 * The back office's demo account. It is public on purpose (D-004): the login page shows it, and anyone can
 * sign in to try the back office. What they change stays in their own browser's sandbox and is deleted
 * within 24 hours, so the account protects nothing. A real shop gets real staff accounts instead (README).
 *
 * The login page (BK-007) shows these values and the back end (worker/src/core/routes/admin.ts) checks them.
 * Like site.ts, this file is also read outside Nuxt, so it imports nothing.
 */
export const demoAccount = {
  email: 'demo@nuanplai.example',
  password: 'nuanplai-demo',
} as const
