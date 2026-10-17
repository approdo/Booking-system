// The booking API for the end-to-end tests (playwright.config.ts starts it): `wrangler dev` on port 8787
// with an empty local D1 under .wrangler/e2e, so every run starts from the same data. No Cloudflare account
// and no network are needed; nothing here touches the Cloudflare account of the real deployment.
//
// The tests book from many fresh browsers (one sandbox each), all from 127.0.0.1, so the two limits per IP
// address are raised for this server only: new sandboxes per 10 minutes, and the address's share of the
// daily write budget. Every other setting is the one in wrangler.toml.
import { spawn, spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workerDir = fileURLToPath(new URL('..', import.meta.url))
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
const stateDir = '.wrangler/e2e'
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }

rmSync(new URL(`../${stateDir}`, import.meta.url), { recursive: true, force: true })

const migrate = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir], {
  cwd: workerDir,
  env,
  stdio: 'inherit',
})
if (migrate.status !== 0) process.exit(migrate.status ?? 1)

const server = spawn(process.execPath, [
  wrangler, 'dev',
  '--port', '8787',
  '--persist-to', stateDir,
  '--var', 'SANDBOXES_PER_10_MINUTES_PER_IP:1000',
  '--var', 'D1_WRITE_BUDGET_PER_IP_PERCENT:100',
], { cwd: workerDir, env, stdio: 'inherit' })

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal))
server.on('exit', code => process.exit(code ?? 0))
