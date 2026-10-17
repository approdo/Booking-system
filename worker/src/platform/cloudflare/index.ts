import { createApp } from './app'
import type { Env } from './env'

/** The booking system's API on Cloudflare Workers (README.md, "Back end on your machine"). */
export default createApp() satisfies ExportedHandler<Env>
