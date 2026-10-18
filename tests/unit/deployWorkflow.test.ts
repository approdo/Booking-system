import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Where .github/workflows/deploy.yml hands out the two Cloudflare secrets (BK-005 AC8, AC11; D-011 L4).
// Only the steps that run wrangler, and the step that checks the secrets are set, get them, in their own
// `env:`. A secret in the `env:` of a job or of the workflow reaches every step of it, including
// `npm ci`, whose packages' install scripts could then read the owner's API token.
//
// Read as text: every step of this workflow starts with `- name:`, which the first test makes sure of.

const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8')
const SECRETS = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] as const
const CHECK_STEP = 'Check Cloudflare secrets'

interface Step {
  name: string
  text: string
}

interface Job {
  id: string
  /** The job's own settings: every line of the job that is not inside `steps:`. */
  settings: string
  steps: Step[]
}

/** The workflow's text before `jobs:`: its own settings. */
const workflowSettings = workflow.slice(0, workflow.indexOf('\njobs:\n'))

function parseJobs(): Job[] {
  const lines = workflow.slice(workflow.indexOf('\njobs:\n') + '\njobs:\n'.length).split('\n')
  const jobs: Job[] = []
  let inSteps = false
  for (const line of lines) {
    const header = /^ {2}([\w-]+):\s*$/.exec(line)
    if (header) {
      jobs.push({ id: header[1]!, settings: '', steps: [] })
      inSteps = false
      continue
    }
    const job = jobs.at(-1)
    if (!job) continue
    if (/^ {4}steps:\s*$/.test(line)) {
      inSteps = true
      continue
    }
    if (/^ {4}\S/.test(line)) inSteps = false
    if (!inSteps) {
      job.settings += `${line}\n`
      continue
    }
    const step = /^ {6}- name: (.+)$/.exec(line)
    if (step) job.steps.push({ name: step[1]!.trim(), text: '' })
    const current = job.steps.at(-1)
    if (current) current.text += `${line}\n`
  }
  return jobs
}

const jobs = parseJobs()
const steps = jobs.flatMap(job => job.steps)
const runsWrangler = (step: Step) => /\bnpx wrangler\b/.test(step.text)
const mentionsSecret = (text: string) => SECRETS.some(name => text.includes(`secrets.${name}`))

describe('.github/workflows/deploy.yml: the Cloudflare secrets', () => {
  it('reads every job and step of the workflow (or the checks below would prove nothing)', () => {
    expect(jobs.map(job => job.id)).toEqual(['build', 'deploy-api', 'deploy'])
    // Every list item under `steps:` is a step that starts with `- name:`.
    const items = workflow.split('\n').filter(line => /^ {6}- /.test(line))
    expect(items.length).toBe(steps.length)
    expect(items.every(line => line.startsWith('      - name: '))).toBe(true)
    const deployApi = jobs.find(job => job.id === 'deploy-api')!
    expect(deployApi.steps.map(step => step.name)).toContain(CHECK_STEP)
    expect(deployApi.steps.filter(runsWrangler).map(step => step.name)).toEqual([
      'Create the D1 database if needed and set its id',
      'Apply D1 migrations',
      'Deploy the Worker',
    ])
  })

  it('never puts them in the env of the workflow or of a job', () => {
    expect(mentionsSecret(workflowSettings)).toBe(false)
    for (const job of jobs) expect(mentionsSecret(job.settings), `job ${job.id}`).toBe(false)
  })

  it('gives them only to the steps that run wrangler, and to the step that checks they are set', () => {
    for (const step of steps.filter(item => mentionsSecret(item.text))) {
      expect(step.name === CHECK_STEP || runsWrangler(step), step.name).toBe(true)
    }
    for (const step of steps.filter(item => item.name === CHECK_STEP || runsWrangler(item))) {
      for (const name of SECRETS) {
        // In the step's own env, under the same name, and only through `secrets.` (AC8).
        expect(step.text, `${step.name}: ${name}`).toMatch(new RegExp(`\\n {8}env:\\n(?: {10}.*\\n)* {10}${name}: \\$\\{\\{ secrets\\.${name} \\}\\}\\n`))
      }
    }
  })

  it('keeps them away from the steps that install dependencies', () => {
    const installs = steps.filter(step => /\bnpm (ci|install)\b/.test(step.text))
    expect(installs.length).toBeGreaterThan(0)
    for (const step of installs) expect(mentionsSecret(step.text), step.name).toBe(false)
  })
})

// BK-011: the end-to-end tests need pages that call the API on the runner (`npm run generate:local`),
// while the pages that go live must call the live API (`npm run generate`, site.apiUrl). Both builds write
// .output/public, so the one that is uploaded must be the live build, made after the tests.
describe('.github/workflows/deploy.yml: the build that goes live', () => {
  const build = jobs.find(job => job.id === 'build')!
  const stepIndex = (pattern: RegExp) => build.steps.findIndex(step => pattern.test(step.text))
  const condition = (step: Step | undefined) => /\n {8}if: >-\n((?: {10}.*\n)+)/.exec(step?.text ?? '')?.[1]

  const testBuild = stepIndex(/\n {8}run: npm run generate:local\n/)
  const tests = stepIndex(/\n {8}run: npm run test:e2e\n/)
  const liveBuild = stepIndex(/\n {8}run: npm run generate\n/)
  const upload = stepIndex(/\n {8}uses: actions\/upload-pages-artifact@/)

  it('runs the end-to-end tests on the build that calls the local API', () => {
    expect(testBuild).toBeGreaterThanOrEqual(0)
    expect(testBuild).toBeLessThan(tests)
  })

  it('uploads the live build, generated after the tests and under the same condition as the upload', () => {
    expect(liveBuild).toBeGreaterThan(tests)
    expect(liveBuild).toBeLessThan(upload)
    // Nothing between them writes .output/public again.
    for (const step of build.steps.slice(liveBuild + 1, upload)) expect(step.text, step.name).not.toMatch(/\bnpm run generate\b/)
    // If the live build were skipped while the upload ran, the test build would go live.
    expect(condition(build.steps[liveBuild])).toBeDefined()
    expect(condition(build.steps[liveBuild])).toBe(condition(build.steps[upload]))
  })
})
