import { createRequire } from 'node:module'
import { describe,it,expect } from 'vitest'
import { reportSeries, exactReportValue, printedRangeStatus } from '../src/lib/reports'
const require=createRequire(import.meta.url)
const parser=require('./report-parser.cjs'),store=require('./report-store.cjs')
const item={label:'Glucose',group:'Glucose',valueText:'95',unit:'mg/dL',referenceText:'70 - 100',page:1}
const draft={hash:'a'.repeat(64),fileName:'synthetic.pdf',pageCount:1}
const input={confirmed:true,date:'2025-01-01',title:'Synthetic',observations:[item]}
describe('medical report transcription and archive',()=>{
 const row=(y:number,cells:Array<[number,string]>)=>({y,items:cells.map(([x,text])=>({x,text}))})
 const header=row(700,[[40,'Test'],[250,'Results'],[340,'Units'],[430,'Biological Reference']])
 it('reads separate unit columns, wrapped names and vertically centred result cells',()=>{
  const rows=[header,row(670,[[40,'BIOCHEMISTRY']]),row(640,[[40,'Glucose, Random']]),row(630,[[40,'Glucose Oxidase Method'],[260,'96'],[335,'mg/dL'],[460,'70 - 140']]),
   row(600,[[40,'High-Density Lipoprotein (HDL)']]),row(588,[[40,'Cholesterol']]),row(578,[[40,'Enzymatic method'],[260,'58'],[335,'mg/dL'],[460,'> 50']]),
   row(550,[[40,'Clinical Significance:']]),row(530,[[40,'Example only'],[260,'250'],[335,'mg/dL'],[460,'< 200']]),row(30,[[450,'Page 1/2']])]
  const results=parser.extractFields([{number:1,method:'text',rows}]).observations
  expect(results.map((o:any)=>o.key)).toEqual(['glucose-random','cholesterol-hdl'])
  expect(results[0]).toMatchObject({value:96,unit:'mg/dL',referenceText:'70 - 140'})
  expect(results[1].referenceText).toBe('> 50')
 })
 it('preserves multi-line references above and below the value and omits footers',()=>{
  const rows=[header,row(650,[[40,'Mentzer Index'],[410,'Beta Thalassemia trait: < 14']]),row(640,[[260,'18'],[315,'Index Value']]),row(630,[[40,'Calculated'],[410,'Iron deficiency anaemia: >= 14']]),row(10,[[450,'Page 1/1']])]
  const item=parser.extractFields([{number:1,rows}]).observations[0]
  expect(item).toMatchObject({key:'mentzer-index',value:18,unit:'Index Value',referenceText:'Beta Thalassemia trait: < 14 Iron deficiency anaemia: >= 14'})
 })
 it('keeps urine specimen context across pages despite liver discussion and skips method-name aliases',()=>{
  const pages=[{number:1,rows:[header,row(675,[[40,'CLINICAL PATHOLOGY']]),row(655,[[40,'Urine Complete Analysis']]),row(630,[[40,'Protein']]),row(620,[[40,'Protein Error of pH Indicator'],[250,'Nil'],[460,'Nil']]),row(590,[[40,'Glucose']]),row(580,[[40,'Enzyme Method'],[250,'Negative'],[460,'Negative']])]},
   {number:2,rows:[header,row(660,[[40,'Epithelial Cells']]),row(650,[[40,'Automated Morphological Microscopy'],[250,'0 - 2'],[330,'/hpf'],[460,'0 - 5']]),row(600,[[40,'Clinical Significance:']]),row(580,[[40,'Follow up with liver function tests.']])]}]
  expect(parser.extractFields(pages).observations.map((o:any)=>o.key)).toEqual(['urine-protein','urine-glucose','urine-epithelial-cells'])
 })
 it('continues reading three-column reports with units beneath the reference',()=>{
  const rows=[row(700,[[40,'Test'],[250,'Result'],[430,'Biological Reference']]),row(650,[[40,'Glucose, Random'],[260,'96'],[450,'70 - 140']]),row(638,[[450,'mg/dL']])]
  expect(parser.extractFields([{number:1,rows}]).observations[0]).toMatchObject({key:'glucose-random',value:96,unit:'mg/dL'})
 })
 it('preserves qualitative, qualified and ambiguous numeric results',()=>{
  expect(parser.parseValue('Nil').value).toBeNull()
  expect(parser.parseValue('0-1').value).toBeNull()
  expect(parser.parseValue('4,8').value).toBeNull()
  expect(parser.parseValue('7,000').value).toBe(7000)
  expect(parser.parseValue('<5')).toMatchObject({value:5,qualifier:'<'})
  expect(parser.parseValue('0').value).toBe(0)
 })
 it('does not invent missing symbols or collapse categorical lab ranges',()=>{
  expect(parser.cleanReference('10\u000020')).toBe('10 - 20')
  expect(parser.cleanReference('\u000050')).toBe('?50')
  expect(parser.parseReference('Normal: <5; high: >=5').high).toBeNull()
  expect(parser.parseReference('<50')).toMatchObject({high:50,highInclusive:false})
 })
 it('requires human confirmation and rejects impossible dates and duplicate fields',()=>{
  expect(()=>store.save(store.emptyStore(),draft,{...input,confirmed:false})).toThrow()
  expect(()=>store.save(store.emptyStore(),draft,{...input,date:'2025-02-30'})).toThrow()
  expect(()=>store.save(store.emptyStore(),draft,{...input,observations:[item,item]})).toThrow()
 })
 it('updates a reimported PDF, recomputes numeric data, and permits restoring history',()=>{
  let saved=store.save(store.emptyStore(),draft,input)
  const id=saved.reports[0].id
  saved=store.save(saved,draft,{...input,observations:[{...item,value:999}]})
  expect(saved.reports).toHaveLength(1)
  expect(saved.reports[0].id).toBe(id)
  expect(saved.reports[0].observations[0].value).toBe(95)
  expect(reportSeries(store.archive(saved,id,true).reports)).toHaveLength(0)
  expect(reportSeries(store.archive(saved,id,false).reports)).toHaveLength(1)
 })
 it('accepts AI suggestions only with matching page evidence',()=>{
  const pageDraft={...draft,pages:[{number:1,text:'Glucose | 95 | mg/dL'}]}
  expect(()=>store.codexSuggestions(JSON.stringify({observations:[{...item,sourceText:'Glucose 999'}]}),pageDraft)).toThrow()
  expect(store.codexSuggestions(JSON.stringify({observations:[{...item,sourceText:'Glucose | 95 | mg/dL'}]}),pageDraft)[0].needsReview).toBe(true)
 })
 it('uses medical date for trends, separates units, and never graphs a qualified number as exact',()=>{
  const first=store.save(store.emptyStore(),draft,input).reports[0]
  const newer={...first,id:'new',date:'2025-02-01',observations:[{...first.observations[0],value:105,valueText:'105'}]}
  const other={...first,id:'unit',observations:[{...first.observations[0],unit:'mmol/L'}]}
  const series=reportSeries([newer,first,other])
  expect(series).toHaveLength(2)
  expect(series[0].latest.report.id).toBe('new')
  expect(exactReportValue({...first.observations[0],qualifier:'<'})).toBeNull()
  expect(printedRangeStatus({...first.observations[0],value:100,highInclusive:false})).toBe('above')
 })
 it('leaves ambiguous numeric dates for the user',()=>{
  const rows=[{y:1,items:[{x:1,text:'Collected: 03/04/2025'}]}]
  expect(parser.extractFields([{number:1,rows}]).detectedDate).toBe('')
 })
})

describe('stable marker reference defaults',()=>{
 it('retains the first saved range across later uploads and reimports, preserving source intervals',()=>{
  const first=store.save(store.emptyStore(),draft,input)
  const second=store.save(first,{...draft,hash:'b'.repeat(64)},{...input,date:'2025-02-01',observations:[{...item,referenceText:'60 - 90'}]})
  expect(second.reports[0].observations[0]).toMatchObject({referenceText:'70 - 100',sourceReferenceText:'60 - 90',low:70,high:100})
  const series=reportSeries(second.reports,second.referenceDefaults)
  expect(series[0].latest.observation.referenceText).toBe('70 - 100')
  const reimport=store.save(second,draft,{...input,observations:[{...item,referenceText:'10 - 20'}]})
  expect(reimport.referenceDefaults[Object.keys(reimport.referenceDefaults)[0]].referenceText).toBe('70 - 100')
 })
 it('takes a first range for new markers or units and fills missing ranges without mixing units',()=>{
  const first=store.save(store.emptyStore(),draft,{...input,observations:[{...item,referenceText:''}]})
  const second=store.save(first,{...draft,hash:'c'.repeat(64)},{...input,observations:[item,{...item,unit:'mmol/L',referenceText:'4 - 6'}]})
  expect(Object.values(second.referenceDefaults).map((r:any)=>r.referenceText).sort()).toEqual(['4 - 6','70 - 100'])
 })
 it('migrates defaults by import order even when an older medical report is uploaded later',()=>{
  const first=store.save(store.emptyStore(),draft,input).reports[0]
  const later={...first,id:'other',hash:'d'.repeat(64),date:'2024-12-01',importedAt:'2099-01-01T00:00:00Z',observations:[{...first.observations[0],referenceText:'1 - 2',low:1,high:2}]}
  const migrated=store.validateStore({version:1,reports:[later,first]})
  expect(Object.values(migrated.referenceDefaults)[0]).toMatchObject({referenceText:'70 - 100'})
 })
})
