'use strict'
const { identify } = require('./report-fields.cjs')
const tidy = value => String(value || '').replace(/\u0000/g,' ').replace(/\s+/g,' ').trim()
function cleanReference(value) { return String(value || '').replace(/(\d)\s*\u0000\s*(?=\d)/g,'$1 - ').replace(/\u0000|\ufffd/g,'?').replace(/\s+/g,' ').trim() }
function parseValue(value) {
  const text=String(value||'').trim()
  const comparable=text.replace(/^([<>≤≥]=?)\s*/, '$1')
  const numericPart=comparable.replace(/^[<>≤≥]=?/, '')
  const normalised=/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numericPart)?comparable.replace(/,/g,''):comparable
  const match=normalised.match(/^([<>≤≥]=?)?\s*(-?\d+(?:\.\d+)?|\.\d+)$/)
  return {valueText:text,value:match?Number(match[2]):null,qualifier:match?.[1] || ''}
}
function parseReference(value) {
  const text=String(value || '').trim().replace(/[–—]/g,'-')
  if(/[?:]|\b(?:normal|deficient|sufficient|trimester|trait)\b/i.test(text))return {low:null,high:null,lowInclusive:true,highInclusive:true}
  const range=text.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/)
  if(range&&Number(range[1])<=Number(range[2]))return {low:Number(range[1]),high:Number(range[2]),lowInclusive:true,highInclusive:true}
  const bound=text.match(/^(<=|>=|<|>|≤|≥)\s*(-?\d+(?:\.\d+)?)$/)
  if(bound)return {low:/>|≥/.test(bound[1])?Number(bound[2]):null,high:/<|≤/.test(bound[1])?Number(bound[2]):null,lowInclusive:/=|≥/.test(bound[1]),highInclusive:/=|≤/.test(bound[1])}
  return {low:null,high:null,lowInclusive:true,highInclusive:true}
}
const unitPattern=/^(?:%|mL|ml|(?:mg|g|ng|pg|ug|μg|µg|mmol|mol|mIU|uIU|μIU|µIU|U|IU|mL|ml|cells|mill|10[³3]|x\s*10[³3])\s*\/\s*(?:dL|L|mL|ml|μL|µL|uL|mm[³3])(?:\/1\.73m[²2])?|ml\/min\/1\.73m[²2]|mL\/min\/1\.73m[²2]|\/mm[³3]|\/hpf|mm\/h|fL|pg|Ratio|Index Value)$/i
function detectDate(pages) {
  const text=pages.map(page=>page.rows.map(row=>row.items.map(item=>item.text).join(' ')).join('\n')).join('\n')
  const months=['january','february','march','april','may','june','july','august','september','october','november','december']
  const named=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i)
  if(named){const date=`${named[3]}-${String(months.indexOf(named[1].toLowerCase())+1).padStart(2,'0')}-${named[2].padStart(2,'0')}`;if(validDate(date))return date}
  const found=text.match(/(?:collected|collection date|sample date|report date|reported)\s*[:|]?\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/i)
  if(found&&(Number(found[1])>12||Number(found[2])>12)){
    const day=Number(found[1])>12?found[1]:found[2], month=Number(found[1])>12?found[2]:found[1]
    const date=`${found[3]}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;if(validDate(date))return date
  }
  const iso=text.match(/(?:collected|collection date|sample date|report date|reported)\s*[:|]?\s*(\d{4}-\d{2}-\d{2})/i)
  return iso&&validDate(iso[1])?iso[1]:''
}
function validDate(date) { if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;const instant=Date.parse(date+'T12:00:00Z');return Number.isFinite(instant)&&new Date(instant).toISOString().slice(0,10)===date&&date>='1900-01-01'&&date<=new Date().toISOString().slice(0,10) }
// Four-column reports center values vertically beside wrapped names and methods.
// Anchor to result cells, then associate only nearby test-name rows and their references.
function fourColumnFields(page,headerIndex,urine) {
  const header=page.rows[headerIndex],resultX=header.items.find(item=>/^results?$/i.test(tidy(item.text))).x
  const unitX=header.items.find(item=>/^units?$/i.test(tidy(item.text))).x
  const referenceX=header.items.find(item=>/reference|biological/i.test(item.text)).x
  const unitBoundary=(resultX+unitX)/2,referenceBoundary=(unitX+referenceX)/2
  const rows=page.rows.slice(headerIndex+1).map(row=>({...row,
    left:row.items.filter(item=>item.x<resultX-12).map(item=>item.text).join(' '),
    value:row.items.filter(item=>item.x>=resultX-12&&item.x<unitBoundary).map(item=>item.text).join(' '),
    unit:row.items.filter(item=>item.x>=unitBoundary&&item.x<referenceBoundary).map(item=>item.text).join(' '),
    reference:row.items.filter(item=>item.x>=referenceBoundary).map(item=>item.text).join(' '),
  }))
  const results=[]
  let previousResult=-1
  for(let index=0;index<rows.length;index++){
    const row=rows[index],valueText=cleanReference(row.value).replace(/\s+\(?(?:H|L)\)?$/,'').trim()
    if(!/^(?:[<>≤≥]=?\s*)?-?\d[\d.,]*(?:\s*-\s*\d+(?:\.\d+)?)?$/.test(valueText)&&! /^(?:nil|negative|positive|normal|absent|present|clear|pale yellow|yellow|trace)$/i.test(valueText))continue
    if(!unitPattern.test(tidy(row.unit))&&!tidy(row.reference))continue
    let match=null
    for(let start=previousResult+1;start<=index;start++){
      if(rows[start].y-row.y>65||rows[start].y<row.y||/method|indicator|calculated|chromatography|microscopy|impedance|immunoassay|photometry|kinetic|urease|uricase/i.test(rows[start].left))continue
      const label=tidy(rows.slice(start,index+1).map(line=>line.left).join(' ')),field=identify(label,urine)
      if(field){match={start,label,field};break}
    }
    if(!match)continue
    results.push({...match,index,valueText,unit:tidy(row.unit)})
    previousResult=index
  }
  return results.map((result,i)=>{
    const stop=results[i+1]?.start??rows.length,referenceParts=[]
    for(const row of rows.slice(result.start,stop)){
      if(/clinical significance|interpretation|conditions of laboratory|approved|reviewed/i.test(row.left)||/page \d/i.test(row.left))break
      // References can start above and continue below the vertically centred value.
      if(rows[result.index].y-row.y>32)break
      if(row.reference.trim())referenceParts.push(row.reference)
    }
    const referenceText=cleanReference(referenceParts.join(' ')),field=result.field
    return {key:field.id,label:field.label,group:field.group,...parseValue(result.valueText),unit:result.unit,referenceText,...parseReference(referenceText),page:page.number,sourceText:[result.label,result.valueText,result.unit,referenceText].filter(Boolean).join(' | ').slice(0,1600),method:page.method||'text',needsReview:referenceText.includes('?')||page.method==='ocr'}
  })
}
function extractFields(pages) {
  const observations=[], warnings=[]
  let urine=false
  for(const page of pages) {
    const rows=page.rows
    let headerIndex=rows.findIndex(row=>row.items.some(item=>/^results?$/i.test(tidy(item.text)))&&row.items.some(item=>/reference|biological/i.test(item.text)))
    if(headerIndex<0)continue
    const bodyHeading=rows.slice(headerIndex+1,headerIndex+8).map(row=>row.items.map(item=>item.text).join(' ')).join('\n')
    if(/^(?:urine complete|urine.*examination|clinical pathology)/im.test(bodyHeading))urine=true
    else if(/^(?:biochemistry|haematology|hematology|immunology|liver function test|kidney function test|lipid profile|complete blood count)\b/im.test(bodyHeading))urine=false
    if(rows[headerIndex].items.some(item=>/^units?$/i.test(tidy(item.text)))){
      for(const observation of fourColumnFields(page,headerIndex,urine)){
        if(observations.some(item=>item.key===observation.key&&item.unit.toLowerCase()===observation.unit.toLowerCase())){warnings.push(`Repeated field on page ${page.number}: ${observation.label}. Review the selected result.`);continue}
        observations.push(observation)
      }
      continue
    }
    const header=rows[headerIndex], resultX=header.items.find(item=>/^results?$/i.test(tidy(item.text))).x
    const referenceX=header.items.find(item=>/reference|biological/i.test(item.text)).x
    if(referenceX<=resultX)continue
    const classified=rows.slice(headerIndex+1).map(row=>({
      ...row,
      left:row.items.filter(item=>item.x<resultX-12).map(item=>item.text).join(' '),
      middle:row.items.filter(item=>item.x>=resultX-12&&item.x<referenceX-12).map(item=>item.text).join(' '),
      right:row.items.filter(item=>item.x>=referenceX-12).map(item=>item.text).join(' '),
    }))
    for(let index=0;index<classified.length;index++) {
      const row=classified[index]
      if(!tidy(row.middle)||!tidy(row.left)||/page \d|approved|reviewed/i.test(row.left))continue
      let end=index+1
      while(end<classified.length&&!tidy(classified[end].middle)&&end-index<12)end++
      const following=classified.slice(index+1,end)
      const label=tidy([row.left,...following.slice(0,3).map(line=>line.left)].join(' '))
      const field=identify(label,urine)
      if(!field)continue
      const valueText=cleanReference(row.middle).replace(/\s+\(?(?:H|L)\)?$/,'').trim()
      if(!valueText||valueText.length>100||/^[A-Za-z ]+:/.test(valueText))continue
      const refs=[row.right,...following.map(line=>line.right)].filter(part=>part.trim())
      let unit=''
      const referenceParts=[]
      for(const part of refs) {const clean=tidy(part);if(unitPattern.test(clean))unit=clean;else referenceParts.push(part)}
      // Some labs print the unit alongside the result rather than under the reference interval.
      const inline=valueText.match(/^([<>≤≥]=?\s*)?(-?\d+(?:\.\d+)?)\s+(.+)$/)
      const actualValue=inline&&unitPattern.test(inline[3])?`${inline[1]||''}${inline[2]}`:valueText
      if(inline&&unitPattern.test(inline[3]))unit=tidy(inline[3])
      const referenceText=cleanReference(referenceParts.join(' '))
      const sourceText=[label,actualValue,unit,referenceText].filter(Boolean).join(' | ').slice(0,1600)
      const observation={key:field.id,label:field.label,group:field.group,...parseValue(actualValue),unit,referenceText,...parseReference(referenceText),page:page.number,sourceText,method:page.method || 'text',needsReview:referenceText.includes('?')||page.method==='ocr'}
      if(observations.some(item=>item.key===field.id&&item.unit.toLowerCase()===unit.toLowerCase())) {warnings.push(`Repeated field on page ${page.number}: ${field.label}. Review the selected result.`);continue}
      observations.push(observation)
    }
  }
  if(observations.some(item=>item.referenceText.includes('?')))warnings.push('Some PDF symbols could not be decoded. Check reference ranges containing ? against the page image.')
  if(pages.some(page=>page.method==='ocr'))warnings.push('Scanned pages were read using local OCR. Check every extracted value, decimal and unit before saving.')
  if(!observations.length)warnings.push('No recognised laboratory rows were found. Add results manually or use the optional Codex extraction, then review them.')
  return {observations,detectedDate:detectDate(pages),warnings}
}
module.exports={tidy,cleanReference,parseValue,parseReference,validDate,extractFields,unitPattern}
