import { renderToStaticMarkup } from 'react-dom/server'
import { describe,it,expect } from 'vitest'
import { LineChart } from './Charts'
import { reportReferenceBand,newReportObservation } from '@/lib/reports'
describe('report reference bands',()=>{
 it('renders a shaded interval, boundaries and a single measured point',()=>{
  const html=renderToStaticMarkup(<LineChart values={[150]} referenceBand={{low:70,high:100}} compact/>)
  expect(html).toContain('Saved reference interval')
  expect(html).toContain('fill-opacity="0.14"')
  expect(html).toContain('<circle')
  expect(html).toContain('stroke-dasharray="4 4"')
 })
 it('supports one-sided ranges and leaves unrelated charts unchanged',()=>{
  expect(renderToStaticMarkup(<LineChart values={[70,120]} referenceBand={{low:null,high:100}}/>)).toContain('Saved reference interval')
  expect(renderToStaticMarkup(<LineChart values={[70,120]}/>)).not.toContain('Saved reference interval')
 })
 it('uses only printed explicit normal categories and does not guess missing symbols or qualitative ranges',()=>{
  const base=newReportObservation()
  expect(reportReferenceBand({...base,referenceText:'Normal: < 6 Prediabetes: 6 - 7'})).toEqual({low:null,high:6})
  expect(reportReferenceBand({...base,referenceText:'Deficient: < 20 Sufficient: 30 - 100'})).toEqual({low:30,high:100})
  expect(reportReferenceBand({...base,referenceText:'Normal: ? 90'})).toBeUndefined()
  expect(reportReferenceBand({...base,referenceText:'Nil'})).toBeUndefined()
 })
})
