// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoData } from '@/data/demo'
import { MovementView } from './MovementPage'
vi.mock('./icons', () => Object.fromEntries('Activity Trend Duration Steps ChevronDown ChevronUp Minus'.split(' ').map(name => [`${name}Icon`, () => null])))
let host: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true}); vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}}); localStorage.clear(); host=document.createElement('div');document.body.append(host);root=createRoot(host) })
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()})
async function render() { const data=createDemoData('2026-10-24');data.generatedAt='2026-10-25T00:00:00Z';await act(async()=>root.render(<MovementView data={data}/>)) }
describe('Movement page',()=>{
  it('shows a single estimate, concise tiles and timestamped intensity without duplicate hourly heatmaps',async()=>{
    await render()
    expect(host.querySelectorAll('.movement-score')).toHaveLength(1)
    expect(host.textContent).toContain('OpenFit movement score')
    expect(host.querySelector('.movement-hour-grid')).toBeNull()
    expect(host.querySelector('details')).toBeNull()
    expect(host.querySelectorAll('.movement-intensity-segment')).toHaveLength(3)
    expect(host.querySelector('.intensity-vigorous')?.getAttribute('aria-label')).toContain('6:05 PM–6:25 PM')
    expect(host.textContent).not.toContain('sitting')
  })
  it('shares the selected range across trends and inactive-period rows',async()=>{
    await render()
    const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='30 days')!
    await act(async()=>button.click())
    expect(host.querySelectorAll('.movement-week-row')).toHaveLength(30)
    expect(host.querySelectorAll('.movement-week-axis')).toHaveLength(1)
    expect(host.querySelectorAll('.movement-week-row.is-selected-day')).toHaveLength(1)
    expect(host.querySelector('.movement-history')?.textContent).toContain('30/30 days')
  })
  it('keeps the movement score independent of editable work hours',async()=>{
    await render()
    const before=host.querySelector('.movement-score')?.textContent
    expect(host.querySelector('select[aria-label="Workday starts"]')).toBeNull()
    const settings=[...host.querySelectorAll('button')].find(b=>b.textContent==='Settings')!
    await act(async()=>settings.click())
    expect(settings.getAttribute('aria-expanded')).toBe('true')
    const select=host.querySelector('select[aria-label="Workday starts"]') as HTMLSelectElement
    await act(async()=>{select.value='12';select.dispatchEvent(new Event('change',{bubbles:true}))})
    expect(host.querySelector('.movement-score')?.textContent).toBe(before)
    expect(JSON.parse(localStorage.getItem('openfit:workday')!).start).toBe(12)
  })
})

it('keeps selected-day history synchronized with its header even when a trend snapshot is stale',async()=>{
  const data=createDemoData('2026-10-24');data.generatedAt='2026-10-25T00:00:00Z'
  data.activity.historyTrends=data.activity.historyTrends!.map(p=>p.date===data.selectedDate?{...p,steps:99999,activeMinutes:999,activeCalories:99999}:p)
  await act(async()=>root.render(<MovementView data={data}/>))
  const score=host.querySelector('.movement-score > strong')!.textContent!.replace('/ 100','').trim()
  const scoreChart=host.querySelector('.movement-history-charts .line-chart svg')!
  expect(scoreChart.querySelector('desc')!.textContent).toContain(`latest value ${score} / 100`)
  expect(host.querySelector('.movement-history')!.textContent).not.toContain('99,999')
})
