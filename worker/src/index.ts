import { createApp } from './app'
import type { Env } from './settings'

/** The booking system's API (Cloudflare Worker): see README.md, "Back end on your machine". */
export default createApp() satisfies ExportedHandler<Env>
