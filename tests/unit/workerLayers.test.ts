import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The two layers of the API (BK-015, D-013): worker/src/core knows nothing about Cloudflare, and
// worker/src/platform/cloudflare is the only place that does. worker/tsconfig.core.json checks the types;
// this checks the names, including in comments and SQL text, which the compiler cannot see.

const src = fileURLToPath(new URL('../../worker/src/', import.meta.url))

/** Every .ts file under a folder of worker/src, with its text. */
function sources(folder: string): { path: string, text: string }[] {
  const root = join(src, folder)
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(path => path.endsWith('.ts'))
    .map(path => ({ path: `${folder}/${path.replaceAll('\\', '/')}`, text: readFileSync(join(root, path), 'utf8') }))
}

/** Lines of `files` that match `pattern`, as "path: line". */
function matching(files: { path: string, text: string }[], pattern: RegExp): string[] {
  return files.flatMap(file => file.text.split('\n').filter(line => pattern.test(line)).map(line => `${file.path}: ${line.trim()}`))
}

/**
 * Cloudflare's types, header, modules, bindings, D1 metrics, D1's batch(), its tools and a Workers-only API.
 * Prose may still say "D1" or "Cloudflare" to explain why a limit exists; code may not use them.
 */
const CLOUDFLARE = /D1[A-Z][A-Za-z]*|ExportedHandler|ScheduledController|ScheduledEvent|ExecutionContext|[Cc][Ff]-[Cc]onnecting-[Ii][Pp]|cloudflare:|@cloudflare\/|\.batch\(|rows_written|rows_read|env\.DB|wrangler|workers\.dev|timingSafeEqual/

describe('worker/src: the core and the Cloudflare layer (D-013)', () => {
  it('has only core/ and platform/, and platform/ has only cloudflare/', () => {
    expect(readdirSync(src).sort()).toEqual(['core', 'platform'])
    expect(readdirSync(join(src, 'platform'))).toEqual(['cloudflare'])
  })

  it('names nothing of Cloudflare in core/', () => {
    const core = sources('core')
    expect(core.length).toBeGreaterThan(10)
    expect(matching(core, CLOUDFLARE)).toEqual([])
  })

  it('finds those names in platform/cloudflare/ (the check above can see them)', () => {
    expect(matching(sources('platform/cloudflare'), CLOUDFLARE).length).toBeGreaterThan(5)
  })

  it('uses in core/ only SQL that SQLite (D1) and PostgreSQL both run: no JSON or date functions, no batch()', () => {
    const SQLITE_ONLY = /json_|jsonb_|strftime|julianday|datetime\(|insert or |replace into|\.batch\(/i
    expect(SQLITE_ONLY.test('SELECT key FROM json_each(?2)')).toBe(true) // the check sees what it looks for
    expect(matching(sources('core'), SQLITE_ONLY)).toEqual([])
  })

  it('never imports platform/ from core/, while platform/cloudflare/ builds on core/', () => {
    const importsOf = (folder: string) => matching(sources(folder), /from '[^']*\/(core|platform)\//)
    expect(importsOf('core').filter(line => line.includes('/platform/'))).toEqual([])
    expect(importsOf('platform/cloudflare').filter(line => line.includes('/core/')).length).toBeGreaterThan(0)
  })
})
