/**
 * Checks `site.url` (app/data/site.ts) before a deploy. Used by scripts/check-site-url.mjs, which the
 * deploy workflow runs before it publishes the site.
 *
 * Plain TypeScript without imports: Node 22.18+ runs it as it is (it strips the types).
 */

export interface SiteUrlContext {
  /** 'owner/repo' of the GitHub repository (GITHUB_REPOSITORY in GitHub Actions), if known. */
  repository?: string
}

/** The template's own example domain and every other reserved .example name. */
function isExampleHost(hostname: string): boolean {
  return hostname === 'example' || hostname.endsWith('.example')
}

/**
 * Returns what is wrong with the site URL for a deploy, as messages for people; [] means it is fine.
 *
 * - It must be an absolute https URL that ends with '/'.
 * - Its host must not be a reserved .example name: that is the template's example value, and the site
 *   would go live with links (canonical, og:image) that lead nowhere.
 * - On GitHub Pages (<owner>.github.io) its path must be the one Pages serves the repository at,
 *   '/<repo>/', or every file of the site would be requested from the wrong place.
 */
export function checkSiteUrl(url: string, context: SiteUrlContext = {}): string[] {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return [`site.url is not an absolute URL: ${url}`]
  }

  if (isExampleHost(parsed.hostname)) {
    return [
      `site.url is still an example address (${url}).`,
      'แก้ `site.url` ใน `app/data/site.ts` ก่อน deploy — ใส่ URL จริงของเว็บ เช่น https://<owner>.github.io/<repo>/ หรือโดเมนของลูกค้า',
    ]
  }

  const problems: string[] = []
  if (parsed.protocol !== 'https:') problems.push(`site.url must start with https:// (now ${url}).`)
  if (!parsed.pathname.endsWith('/') || parsed.search || parsed.hash) {
    problems.push(`site.url must end with '/', without ? or # (now ${url}).`)
  }

  const [owner, repo] = context.repository?.split('/') ?? []
  if (owner && repo && parsed.hostname.endsWith('.github.io')) {
    const host = `${owner.toLowerCase()}.github.io`
    // A repository named <owner>.github.io is served at the root of that host.
    const path = repo.toLowerCase() === host ? '/' : `/${repo}/`
    if (parsed.hostname !== host || parsed.pathname !== path) {
      problems.push(`site.url does not match the repository ${context.repository}: GitHub Pages serves it at https://${host}${path} (now ${url}).`)
    }
  }

  if (problems.length > 0) problems.push('แก้ `site.url` ใน `app/data/site.ts` ก่อน deploy')
  return problems
}
