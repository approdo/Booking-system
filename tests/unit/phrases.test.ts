import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import PhraseText from '../../app/components/PhraseText'
import type { ThaiText } from '../../app/types/content'
import { joinPhrases, toPhraseParts } from '../../app/utils/phrases'

// A space after 'บริการครบ', none between the other phrases.
const heading = ['ร้านเล็ก', 'ใกล้บ้าน ', 'บริการครบ', 'ในที่เดียว']

function renderPhraseText(text: ThaiText, accent?: string) {
  return renderToString(createSSRApp({ render: () => h(PhraseText, { text, accent }) }))
}

function textContent(html: string) {
  return html.replace(/<[^>]*>/g, '')
}

/** Counts the elements at the top level of an HTML fragment (<wbr> has no closing tag). */
function topLevelElementCount(html: string) {
  let depth = 0
  let count = 0
  for (const [, slash, name] of html.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
    if (slash) depth--
    else {
      if (depth === 0) count++
      if (name !== 'wbr') depth++
    }
  }
  return count
}

describe('joinPhrases', () => {
  it('joins the phrases exactly as written, spaces included', () => {
    expect(joinPhrases(heading)).toBe('ร้านเล็กใกล้บ้าน บริการครบในที่เดียว')
  })

  it('adds nothing between phrases, and returns a plain string unchanged', () => {
    expect(joinPhrases(['A', 'B'])).toBe('AB')
    expect(joinPhrases('ข้อความ ธรรมดา')).toBe('ข้อความ ธรรมดา')
    expect(joinPhrases([])).toBe('')
  })
})

describe('toPhraseParts', () => {
  it('moves the space at the end of a phrase out of the phrase', () => {
    expect(toPhraseParts(['ใกล้บ้าน ', 'บริการครบ'])[0]).toEqual({ text: 'ใกล้บ้าน', space: ' ', wbr: false })
  })

  it('marks a break with <wbr> between phrases that have no space between them, but not after the last', () => {
    expect(toPhraseParts(heading)[0]).toEqual({ text: 'ร้านเล็ก', space: '', wbr: true })
    expect(toPhraseParts(heading).at(-1)).toEqual({ text: 'ในที่เดียว', space: '', wbr: false })
  })

  it('keeps spaces inside a phrase, where the line must not break', () => {
    expect(toPhraseParts(['เปิด 09:00–18:00 น.'])[0]!.text).toBe('เปิด 09:00–18:00 น.')
  })
})

describe('<PhraseText>', () => {
  it('puts each phrase in a nowrap span, the space after the span and <wbr> where there is no space', async () => {
    expect(await renderPhraseText(heading)).toBe(
      '<span>'
      + '<span class="whitespace-nowrap">ร้านเล็ก</span><wbr>'
      + '<span class="whitespace-nowrap">ใกล้บ้าน</span> '
      + '<span class="whitespace-nowrap">บริการครบ</span><wbr>'
      + '<span class="whitespace-nowrap">ในที่เดียว</span>'
      + '</span>',
    )
  })

  it('wraps all phrases in one element and shows the same text as joinPhrases', async () => {
    const html = await renderPhraseText(heading)
    expect(topLevelElementCount(html)).toBe(1)
    expect(textContent(html)).toBe(joinPhrases(heading))
  })

  it('shows a plain string as one run of text that the browser may break anywhere', async () => {
    expect(await renderPhraseText('ข้อความ ธรรมดา')).toBe('<span>ข้อความ ธรรมดา</span>')
  })

  it('wraps the first place of the accent words in <em>, inside their phrase', async () => {
    expect(await renderPhraseText(['ร้านเล็ก ', 'ใกล้บ้านคุณ'], 'ใกล้บ้าน')).toBe(
      '<span><span class="whitespace-nowrap">ร้านเล็ก</span> '
      + '<span class="whitespace-nowrap"><em>ใกล้บ้าน</em>คุณ</span></span>',
    )
    expect(await renderPhraseText('a b a', 'a')).toBe('<span><em>a</em> b a</span>')
    expect(await renderPhraseText('a b', 'z')).toBe('<span>a b</span>')
  })
})
