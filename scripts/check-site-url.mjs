// Stops a deploy while `site.url` in app/data/site.ts is still the template's example address,
// or does not fit where the site will be served. The deploy workflow runs it before it publishes.
//
//   npm run check:site-url                       checks site.url
//   npm run check:site-url -- https://x.example  checks another URL (to try the rules)
//
// In GitHub Actions, GITHUB_REPOSITORY ('owner/repo') is set, and a github.io URL must then match it.
// Exit code: 0 = fine, 1 = something to fix (printed), 2 = wrong usage.
// Node 22.18+ strips TypeScript types on import, so this reads the same data as the site.
import { site } from '../app/data/site.ts'
import { checkSiteUrl } from './lib/siteUrl.ts'

const args = process.argv.slice(2)
if (args.length > 1) {
  console.error('Usage: npm run check:site-url [-- <url>]')
  process.exit(2)
}

const url = args[0] ?? site.url
const problems = checkSiteUrl(url, { repository: process.env.GITHUB_REPOSITORY })

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
console.log(`site.url is ready for a deploy: ${url}`)
