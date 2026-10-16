// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // Wrangler's local state and dry-run bundles (worker/.wrangler) are generated, not source.
  ignores: ['**/.wrangler/**'],
})
