import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { LIGHT, clawdAlt, clawdSvg } from '../src/clawd.ts'
import type { Pose } from '../src/contracts.ts'
import type { Limit } from '../types'

const pose = atom({ plugin: 'csb', key: 'pose' } as const, 'idle' as Pose, { shape: 'pose-1' })
const limits = atom({ plugin: 'csb', key: 'limits' } as const, [], { shape: 'limits-1' })
const ctx = atom({ plugin: 'csb', key: 'ctx' } as const, null, { shape: 'ctx-1' })

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3600e3, seven_day: 7 * 24 * 3600e3 }
const LABEL: Record<string, string> = { five_hour: '5h', seven_day: 'week' }
const GOOD = '#3f9b5a'
const WARN = '#d9a021'
const BAD = '#d6453d'

const ringSvg = (p: number, color: string, alt: string) => {
  const c = 2 * Math.PI * 7
  const fill = Math.max(0, Math.min(100, p))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" role="img" aria-label="${alt}"><title>${alt}</title>` +
    `<circle cx="10" cy="10" r="7" fill="none" stroke-width="3.2" stroke="#9ca3af" stroke-opacity="0.3"/>` +
    (fill > 0
      ? `<circle cx="10" cy="10" r="7" fill="none" stroke-width="3.2" stroke="${color}" stroke-linecap="round" stroke-dasharray="${((c * fill) / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 10 10)"/>`
      : '') +
    `</svg>`
  )
}

// + = under an even pace (room to use more), - = over it
const delta = (l: Limit, now: number) => {
  const win = WINDOW_MS[l.kind]
  const left = l.resetsAt ? Date.parse(l.resetsAt) - now : win
  return Math.round(Math.max(0, Math.min(100, (1 - left / win) * 100)) - l.percentUsed)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => (await update($, pose, () => 'idle'), next(e)))

  on('prompt.submit', async ($, e, next) => (await update($, pose, () => 'think'), next(e))).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const t = e.tool
    await update($, pose, () => (/^(Read|Glob|Grep|WebFetch|WebSearch)$/.test(t) ? 'read' : /^(Edit|Write|NotebookEdit)$/.test(t) ? 'write' : 'type'))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => (await update($, pose, () => 'done'), next(e)))

  on('session.measure', async ($, e, next) => {
    await update($, limits, () => e.rateLimits.filter(l => l.kind in WINDOW_MS))
    await update($, ctx, () => e.context.percent ?? null)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface === 'terminal') return next(e)

    const { Box, Text, Svg } = $.ui.resolve(e) as unknown as Record<'Box' | 'Text' | 'Svg', (p: any) => unknown>
    const now = await $.clock.now()
    const list = await read($, limits)
    const c = await read($, ctx)
    const p = await read($, pose)

    const items: { svg: string; text: string; label: string; d: number | null; color: string }[] = []
    if (c !== null) items.push({ svg: ringSvg(c, c >= 80 ? BAD : c >= 60 ? WARN : GOOD, `Context ${Math.round(c)}% full`), text: `${Math.round(c)}%`, label: 'context', d: null, color: GOOD })
    for (const l of list) {
      const d = delta(l, now)
      const color = d < -10 ? BAD : d < 0 ? WARN : GOOD
      items.push({ svg: ringSvg(l.percentUsed, color, `${LABEL[l.kind]} ${Math.round(l.percentUsed)}% used, pace ${d}%`), text: `${Math.round(l.percentUsed)}%`, label: LABEL[l.kind], d, color })
    }

    const worst = Math.min(0, ...list.map(l => delta(l, now)))
    const mood = list.some(l => l.percentUsed >= 95) ? 'panic' : worst < -10 ? 'worried' : 'calm'
    const clawd = clawdSvg(p, mood, { animate: true, palette: LIGHT })

    return (
      <Box>
        <Box marginRight={2}>
          <Svg source={clawd} alt={clawdAlt(p)} width={52} />
        </Box>
        {items.map(i => {
          const d = i.d === null ? '' : `${i.d > 0 ? '+' : ''}${i.d}%`
          const w = Math.round(58 + (i.label === '5h' ? 12 : i.label === 'week' ? 10 : i.label === 'context' ? -22 : 0) + (i.text.length + i.label.length + d.length) * 10.5)
          // Fixed dark pill with light text: readable whatever the app's theme.
          const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 40" width="${w}" height="40">` +
            `<rect x="0" y="2" width="${w}" height="36" rx="18" fill="#1f1e1d"/>` +
            i.svg.replace('width="20" height="20"', 'x="9" y="7" width="26" height="26"') +
            `<text x="43" y="26" fill="#f3f1ea" font-family="system-ui,sans-serif">` +
            `<tspan font-size="17" font-weight="700">${i.text}</tspan>` +
            `<tspan font-size="14" fill-opacity="0.7" dx="6">${i.label}</tspan>` +
            (d ? `<tspan font-size="17" font-weight="700" fill="${i.color}" dx="6">${d}</tspan>` : '') +
            `</text></svg>`
          return (
            <Box marginRight={2}>
              <Svg source={svg} alt={`${i.label} ${i.text} ${d}`} width={w} height={40} />
            </Box>
          )
        })}
      </Box>
    )
  })
}
