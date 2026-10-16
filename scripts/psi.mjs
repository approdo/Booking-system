// Measures a live page with PageSpeed Insights (PSI): mobile, lab data, several runs, median of each score.
//
//   npm run psi -- <url> [--runs <n>]        default 5 runs, at most 10
//
// Two ways to reach PSI (lesson G-051):
//   1. The PSI API, when the environment variable PSI_API_KEY holds an API key. The key is read from the
//      environment only (never from a file), and is never printed or saved.
//   2. The web page https://pagespeed.web.dev/ in a visible Chromium window (Playwright), when there is
//      no key or the API answers 429 (too many requests). A headless browser gets 429 there, so a window
//      opens for each run; leave it alone until it closes. The page sends the same Lighthouse result
//      as the API, which this script reads from the page's network responses.
//
// A run counts only when its result is complete (4 scores, no runtime error) and fresh: a fetchTime that
// no earlier run had, and not older than the request (PSI may hand back a cached result). Runs start at
// least 61 s apart. More than 3 runs that do not count = stop.
//
// Results go to psi-results/<UTC time>-<host>/ (ignored by git): summary.json with every run and the
// median, and run-<n>.json, the full Lighthouse result of each counted run.
// Exit code: 0 = all runs counted, 1 = fewer runs than asked, 2 = wrong usage.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const USAGE = `Usage: npm run psi -- <url> [--runs <n>]

  <url>       the live page to measure, e.g. https://<owner>.github.io/<repo>/
  --runs <n>  number of runs, 1 to 10 (default 5); the result is the median

Set PSI_API_KEY in the environment to use the PSI API; without it, a Chromium window opens
pagespeed.web.dev for each run.`

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']
const GAP_BETWEEN_RUNS_MS = 61_000
const MAX_UNCOUNTED_RUNS = 3
// The request time comes from this computer's clock and fetchTime from Google's: allow some difference.
const CLOCK_TOLERANCE_MS = 30_000
const RESULT_TIMEOUT_MS = 240_000

function fail(message) {
  console.error(`${message}\n\n${USAGE}`)
  process.exit(2)
}

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------
let parsed
try {
  parsed = parseArgs({ allowPositionals: true, options: { runs: { type: 'string', default: '5' } } })
}
catch (error) {
  fail(error.message)
}
const [target, ...extra] = parsed.positionals
if (!target) fail('No URL given.')
if (extra.length > 0) fail(`One URL at a time (also got: ${extra.join(' ')}).`)
if (!/^https?:\/\//.test(target) || !URL.canParse(target)) fail(`Not an http(s) URL: ${target}`)
const runs = Number(parsed.values.runs)
if (!Number.isInteger(runs) || runs < 1 || runs > 10) fail(`--runs must be a whole number from 1 to 10, not ${parsed.values.runs}`)

const apiKey = process.env.PSI_API_KEY?.trim() || ''
/** Never let the key reach the terminal, even inside an error message. */
const hideKey = text => (apiKey ? String(text).replaceAll(apiKey, '<PSI_API_KEY>') : String(text))

// ---------------------------------------------------------------------------------------------
// Channel 1: the PSI API
// ---------------------------------------------------------------------------------------------
class RateLimitedError extends Error {}

async function runWithApi(url) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('strategy', 'mobile')
  for (const category of CATEGORIES) endpoint.searchParams.append('category', category.toUpperCase().replace('-', '_'))
  endpoint.searchParams.set('key', apiKey)

  const response = await fetch(endpoint, { signal: AbortSignal.timeout(RESULT_TIMEOUT_MS) })
  if (response.status === 429) throw new RateLimitedError('the PSI API answered 429 (too many requests)')
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(`the PSI API answered ${response.status}: ${body.error?.message ?? response.statusText}`)
  }
  const body = await response.json()
  if (!body.lighthouseResult) throw new Error('the PSI API answer has no lighthouseResult')
  return body.lighthouseResult
}

// ---------------------------------------------------------------------------------------------
// Channel 2: pagespeed.web.dev in Chromium
// ---------------------------------------------------------------------------------------------

/**
 * The page polls .../data/batchexecute; its last answer holds each Lighthouse result as a JSON string,
 * nested in arrays of JSON strings. Returns every string that looks like a Lighthouse result.
 */
function lighthouseStringsIn(text) {
  const found = []
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith('{') && value.includes('"lighthouseVersion"')) found.push(value)
      else if (value.startsWith('[')) {
        try {
          walk(JSON.parse(value))
        }
        catch { /* not JSON */ }
      }
    }
    else if (Array.isArray(value)) value.forEach(walk)
  }
  for (const line of text.split('\n')) {
    if (!line.startsWith('[')) continue
    try {
      walk(JSON.parse(line))
    }
    catch { /* a partial chunk */ }
  }
  return found
}

const sameUrl = (a, b) => URL.canParse(a) && URL.canParse(b) && new URL(a).href === new URL(b).href

async function runOnWebPage(url) {
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: false })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })
    const page = await context.newPage()
    let result = null
    page.on('response', async (response) => {
      if (result || !new URL(response.url()).pathname.endsWith('/data/batchexecute')) return
      let text
      try {
        text = await response.text()
      }
      catch {
        return
      }
      for (const json of lighthouseStringsIn(text)) {
        try {
          const lhr = JSON.parse(json)
          if (lhr.configSettings?.formFactor === 'mobile' && sameUrl(lhr.requestedUrl, url)) result ??= lhr
        }
        catch { /* not a full result */ }
      }
    })
    await page.goto(`https://pagespeed.web.dev/report?url=${encodeURIComponent(url)}&form_factor=mobile`)
    const deadline = Date.now() + RESULT_TIMEOUT_MS
    while (!result && Date.now() < deadline) await page.waitForTimeout(1000)
    if (!result) throw new Error(`pagespeed.web.dev gave no mobile result within ${RESULT_TIMEOUT_MS / 1000} s`)
    return result
  }
  finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------

/** The numbers of one Lighthouse result, and why it does not count (an empty list if it does). */
function readResult(lhr, requestedAt, earlierFetchTimes) {
  const score = id => (typeof lhr.categories?.[id]?.score === 'number' ? Math.round(lhr.categories[id].score * 100) : null)
  const audit = id => lhr.audits?.[id]?.numericValue ?? null
  const row = {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
    fcpMs: audit('first-contentful-paint'),
    lcpMs: audit('largest-contentful-paint'),
    tbtMs: audit('total-blocking-time'),
    cls: audit('cumulative-layout-shift'),
    speedIndexMs: audit('speed-index'),
    fetchTime: lhr.fetchTime ?? null,
    requestedUrl: lhr.requestedUrl ?? null,
    finalDisplayedUrl: lhr.finalDisplayedUrl ?? null,
    lighthouseVersion: lhr.lighthouseVersion ?? null,
  }
  const reasons = []
  for (const id of CATEGORIES) if (score(id) === null) reasons.push(`no ${id} score`)
  if (lhr.runtimeError) reasons.push(`Lighthouse error ${lhr.runtimeError.code ?? ''}`.trim())
  if (lhr.configSettings?.formFactor !== 'mobile') reasons.push('not a mobile result')
  const fetched = Date.parse(row.fetchTime)
  if (Number.isNaN(fetched)) reasons.push('no fetchTime')
  else if (fetched < Date.parse(requestedAt) - CLOCK_TOLERANCE_MS) reasons.push(`cached: fetchTime ${row.fetchTime} is before the request`)
  if (earlierFetchTimes.includes(row.fetchTime)) reasons.push(`cached: fetchTime ${row.fetchTime} repeats an earlier run`)
  return { row, reasons }
}

function median(values) {
  const sorted = values.filter(value => typeof value === 'number').sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const startedAt = new Date().toISOString()
// Printed as a path inside the project, so a copied log never shows the folders of this computer.
const outName = `psi-results/${startedAt.replace(/[:.]/g, '-')}-${new URL(target).hostname}`
const outDir = fileURLToPath(new URL(`../${outName}/`, import.meta.url))
await mkdir(outDir, { recursive: true })

let channel = apiKey ? 'api' : 'web'
console.log(`PSI mobile, ${runs} run(s) of ${target} via ${channel === 'api' ? 'the PSI API' : 'pagespeed.web.dev (a Chromium window opens)'}`)

const counted = []
const uncounted = []
let lastFinishedAt = 0

while (counted.length < runs && uncounted.length <= MAX_UNCOUNTED_RUNS) {
  const waitMs = lastFinishedAt + GAP_BETWEEN_RUNS_MS - Date.now()
  if (lastFinishedAt && waitMs > 0) {
    console.log(`waiting ${Math.ceil(waitMs / 1000)} s before the next run`)
    await wait(waitMs)
  }

  const requestedAt = new Date().toISOString()
  const attempt = { attempt: counted.length + uncounted.length + 1, channel, requestedAt }
  try {
    const lhr = channel === 'api' ? await runWithApi(target) : await runOnWebPage(target)
    const { row, reasons } = readResult(lhr, requestedAt, [...counted, ...uncounted].map(run => run.fetchTime))
    Object.assign(attempt, row, { reasons })
    if (reasons.length === 0) {
      attempt.run = counted.length + 1
      await writeFile(join(outDir, `run-${attempt.run}.json`), JSON.stringify(lhr))
      counted.push(attempt)
    }
    else uncounted.push(attempt)
  }
  catch (error) {
    attempt.reasons = [hideKey(error.message)]
    uncounted.push(attempt)
    if (error instanceof RateLimitedError) {
      console.log('The PSI API answered 429 (too many requests): the next runs use pagespeed.web.dev.')
      channel = 'web'
    }
  }
  lastFinishedAt = Date.now()

  const scores = CATEGORIES.map(id => `${id} ${attempt[id === 'best-practices' ? 'bestPractices' : id] ?? '-'}`).join(', ')
  console.log(attempt.run ? `run ${attempt.run}: ${scores} (fetchTime ${attempt.fetchTime})` : `not counted: ${attempt.reasons.join('; ')}`)
}

const summary = {
  url: target,
  strategy: 'mobile',
  runsAsked: runs,
  runsCounted: counted.length,
  startedAt,
  median: Object.fromEntries(
    ['performance', 'accessibility', 'bestPractices', 'seo', 'fcpMs', 'lcpMs', 'tbtMs', 'cls', 'speedIndexMs']
      .map(key => [key, median(counted.map(run => run[key]))]),
  ),
  runs: counted,
  uncounted,
}
await writeFile(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)

const m = summary.median
console.log(`\nMedian of ${counted.length} run(s): performance ${m.performance}, accessibility ${m.accessibility}, `
  + `best practices ${m.bestPractices}, SEO ${m.seo} (LCP ${m.lcpMs === null ? '-' : Math.round(m.lcpMs)} ms, CLS ${m.cls})`)
console.log(`Saved in ${outName}/`)
process.exit(counted.length === runs ? 0 : 1)
