'use strict'
const crypto=require('node:crypto')
const { parseValue,parseReference,validDate }=require('./report-parser.cjs')
const { identify,normalise }=require('./report-fields.cjs')
function emptyStore(){return {version:1,reports:[]}}
function observation(input,pages){
  if(!input||typeof input.label!=='string'||!input.label.trim()||input.label.length>200||typeof input.valueText!=='string'||!input.valueText.trim()||input.valueText.length>100||typeof input.unit!=='string'||input.unit.length>80||typeof input.referenceText!=='string'||input.referenceText.length>1000||typeof input.group!=='string'||input.group.length>60||!Number.isInteger(input.page)||input.page<1||input.page>pages)throw new Error('Check every result name, value, unit, reference range and source page.')
  const matched=identify(input.label,input.group==='Urinalysis')
  const key=matched?.id || (typeof input.key==='string'&&/^[a-z0-9-]{1,100}$/.test(input.key)?input.key:'custom-'+normalise(input.label).replaceAll(' ','-').slice(0,85))
  return {...(typeof input.sourceReferenceText==='string'?{sourceReferenceText:input.sourceReferenceText.slice(0,1000)}:{}),key,label:input.label.trim(),group:input.group.trim()||'Other',...parseValue(input.valueText),unit:input.unit.trim(),referenceText:input.referenceText.trim(),...parseReference(input.referenceText),page:input.page,sourceText:String(input.sourceText||'Manually entered result; verify against source PDF.').slice(0,1600),method:['text','ocr','codex','manual'].includes(input.method)?input.method:'manual',needsReview:Boolean(input.needsReview)}
}
const resultKey=item=>item.key+'|'+item.unit.trim().toLowerCase().replace(/[μµ]/g,'u').replace(/³/g,'3').replace(/²/g,'2').replace(/\s+/g,'')
function referenceDefaults(store){
  const defaults={...(store.referenceDefaults||{})}
  for(const report of [...store.reports].sort((a,b)=>a.importedAt.localeCompare(b.importedAt)))for(const item of report.observations){
    const key=resultKey(item)
    if(!defaults[key]&&item.referenceText.trim()&&!item.referenceText.includes('?'))defaults[key]={referenceText:item.referenceText,...parseReference(item.referenceText)}
  }
  return defaults
}
function applyDefaults(items,defaults){return items.map(item=>{const ref=defaults[resultKey(item)];return ref?{...item,sourceReferenceText:item.sourceReferenceText??item.referenceText,...ref,referenceDefault:true,needsReview:item.method==='ocr'}:item})}
function validateStore(store){
  if(store?.version!==1||!Array.isArray(store.reports)||store.reports.length>500)throw new Error('Unsupported or damaged report archive.')
  if(store.referenceDefaults!==undefined){
    if(!store.referenceDefaults||typeof store.referenceDefaults!=='object'||Array.isArray(store.referenceDefaults))throw new Error('Invalid default reference ranges.')
    for(const [key,range] of Object.entries(store.referenceDefaults))if(key.length>250||!range||typeof range.referenceText!=='string'||range.referenceText.length>1000)throw new Error('Invalid default reference range.')
  }
  store.referenceDefaults=referenceDefaults(store)
  for(const key of Object.keys(store.referenceDefaults))store.referenceDefaults[key]={referenceText:store.referenceDefaults[key].referenceText,...parseReference(store.referenceDefaults[key].referenceText)}
  const ids=new Set(),hashes=new Set()
  for(const report of store.reports){
    if(!report||typeof report.id!=='string'||ids.has(report.id)||typeof report.hash!=='string'||!/^[a-f0-9]{64}$/.test(report.hash)||hashes.has(report.hash)||!validDate(report.date)||typeof report.title!=='string'||report.title.length>200||!Number.isInteger(report.pageCount)||report.pageCount<1||report.pageCount>40||!Array.isArray(report.observations)||report.observations.length>300||typeof report.archived!=='boolean')throw new Error('Invalid medical report archive.')
    report.observations.forEach(item=>observation(item,report.pageCount));ids.add(report.id);hashes.add(report.hash)
  }
  if(Buffer.byteLength(JSON.stringify(store))>20*1024*1024)throw new Error('The report index exceeds the 20 MB limit. Export a copy before adding more.')
  return store
}
function save(store,draft,input){
  validateStore(store)
  if(!input||input.confirmed!==true||!validDate(input.date)||typeof input.title!=='string'||!input.title.trim()||input.title.length>200||!Array.isArray(input.observations)||!input.observations.length||input.observations.length>300)throw new Error('Confirm the report date and review at least one result before saving.')
  const defaults=referenceDefaults(store)
  const values=applyDefaults(input.observations.map(item=>observation(item,draft.pageCount)),defaults)
  for(const item of values)if(!defaults[resultKey(item)]&&item.referenceText.trim()&&!item.referenceText.includes('?'))defaults[resultKey(item)]={referenceText:item.referenceText,...parseReference(item.referenceText)}
  const seen=new Set()
  for(const item of values){const id=item.key+'|'+item.unit.toLowerCase().replace(/\s/g,'');if(seen.has(id))throw new Error('Duplicate result fields use the same units. Keep one result per test and unit in this report.');seen.add(id)}
  const next={...structuredClone(store),referenceDefaults:defaults},now=new Date().toISOString(),existing=next.reports.find(report=>report.hash===draft.hash)
  const result={id:existing?.id||crypto.randomUUID(),hash:draft.hash,fileName:draft.fileName,title:input.title.trim(),date:input.date,pageCount:draft.pageCount,observations:values,archived:existing?.archived||false,importedAt:existing?.importedAt||now,updatedAt:now}
  if(existing)next.reports=next.reports.map(report=>report.id===existing.id?result:report);else next.reports.unshift(result)
  return validateStore(next)
}
function archive(store,id,archived){validateStore(store);if(typeof archived!=='boolean')throw new Error('Invalid report state.');const next=structuredClone(store),report=next.reports.find(report=>report.id===id);if(!report)throw new Error('Report no longer exists.');report.archived=archived;report.updatedAt=new Date().toISOString();return next}
function codexSuggestions(text,draft){
  let decoded
  try{decoded=JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''))}catch{throw new Error('Codex did not return valid structured results. Your local extraction was preserved.')}
  if(!Array.isArray(decoded.observations)||decoded.observations.length>300)throw new Error('Codex returned an invalid result list.')
  const result=[]
  for(const input of decoded.observations){
    const page=draft.pages.find(page=>page.number===input.page)
    const evidence=typeof input.sourceText==='string'?input.sourceText.trim():''
    const squash=value=>String(value||'').replace(/\s+/g,' ').trim()
    if(!page||!evidence||!squash(page.text).includes(squash(evidence))||!squash(evidence).includes(squash(input.valueText)))continue
    result.push(observation({...input,unit:input.unit||'',referenceText:input.referenceText||'',group:input.group||'Other',sourceText:evidence,method:'codex',needsReview:true},draft.pageCount))
  }
  if(!result.length)throw new Error('No Codex suggestions could be matched to the source text. Use the local extraction or add results manually.')
  return result
}
module.exports={referenceDefaults,applyDefaults,emptyStore,validateStore,save,archive,observation,codexSuggestions}
