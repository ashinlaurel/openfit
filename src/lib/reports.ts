import type { MedicalReport, ReportObservation, ReportReference } from '../types'
export const reportGroups=['Glucose','Lipids','Liver','Kidney','Electrolytes','Blood count','Thyroid','Vitamins','Iron','Inflammation','Urinalysis','Other']
export function unitKey(unit:string) {return unit.trim().toLowerCase().replace(/[μµ]/g,'u').replace(/³/g,'3').replace(/²/g,'2').replace(/\s+/g,'')}
export const observationKey=(item:ReportObservation)=>`${item.key}|${unitKey(item.unit)}`
export type ReportPoint={report:MedicalReport;observation:ReportObservation}
export function reportSeries(reports:MedicalReport[],savedDefaults:Record<string,ReportReference>={}) {
  const defaults={...savedDefaults}
  for(const report of [...reports].sort((a,b)=>a.importedAt.localeCompare(b.importedAt)))for(const item of report.observations){const key=observationKey(item);if(!defaults[key]&&item.referenceText.trim()&&!item.referenceText.includes('?'))defaults[key]={referenceText:item.referenceText,low:item.low,high:item.high,lowInclusive:item.lowInclusive,highInclusive:item.highInclusive}}

  const map=new Map<string,ReportPoint[]>()
  for(const report of reports.filter(report=>!report.archived))for(const observation of report.observations){
    const key=observationKey(observation)
    if(!map.has(key))map.set(key,[])
    map.get(key)!.push({report,observation})
  }
  for(const points of map.values())points.sort((a,b)=>a.report.date.localeCompare(b.report.date)||a.report.importedAt.localeCompare(b.report.importedAt))
  return [...map.entries()].map(([key,points])=>({key,points,latest:{...points.at(-1)!,observation:{...points.at(-1)!.observation,...defaults[key]}}}))
}
export function reportReferenceBand(item:ReportObservation){
  if(item.referenceText.includes('?'))return undefined
  if(item.low!==null||item.high!==null)return {low:item.low,high:item.high}
  // Only explicitly named normal/sufficient intervals, never inferred clinical cutoffs.
  const match=item.referenceText.match(/(?:^|\s)(?:Normal|Sufficient):\s*(?:(<=|>=|<|>|≤|≥)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?))/i)
  if(!match)return undefined
  return match[1]?{low:/>|≥/.test(match[1])?Number(match[2]):null,high:/<|≤/.test(match[1])?Number(match[2]):null}:{low:Number(match[3]),high:Number(match[4])}
}
export function printedRangeStatus(item:ReportObservation):'below'|'above'|'within'|'unknown' {
  if(item.value===null||item.qualifier||item.referenceText.includes('?')||item.low===null&&item.high===null)return 'unknown'
  if(item.low!==null&&(item.value<item.low||!item.lowInclusive&&item.value===item.low))return 'below'
  if(item.high!==null&&(item.value>item.high||!item.highInclusive&&item.value===item.high))return 'above'
  return 'within'
}
export function exactReportValue(item:ReportObservation) {return item.value!==null&&!item.qualifier?item.value:null}
export function newReportObservation():ReportObservation {
  return {key:'',label:'',group:'Other',valueText:'',value:null,qualifier:'',unit:'',referenceText:'',low:null,high:null,lowInclusive:true,highInclusive:true,page:1,sourceText:'Manually entered result; verify against source PDF.',method:'manual',needsReview:true}
}
