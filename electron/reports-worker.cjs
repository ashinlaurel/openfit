'use strict'
const { parentPort, workerData }=require('node:worker_threads')
const fs=require('node:fs')
const { createCanvas }=require('@napi-rs/canvas')
const { extractFields }=require('./report-parser.cjs')
async function run(){
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs')
  const bytes=new Uint8Array(workerData.bytes)
  if(bytes.length>20*1024*1024)throw new Error('Choose a PDF smaller than 20 MB.')
  const task=pdfjs.getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false,stopAtErrors:true,maxImageSize:20_000_000,disableFontFace:true})
  let ocr=null
  try{
    const document=await task.promise
    if(document.numPages>40)throw new Error('Reports currently support PDFs of up to 40 pages. Split larger files before importing.')
    if(workerData.action==='preview'){
      const page=await document.getPage(workerData.page),base=page.getViewport({scale:1}),scale=Math.min(1.7,1400/base.width),viewport=page.getViewport({scale})
      const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height))
      await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport}).promise
      return {image:`data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`}
    }
    const pages=[]
    for(let number=1;number<=document.numPages;number++){
      const page=await document.getPage(number),viewport=page.getViewport({scale:1}),content=await page.getTextContent(),rows=[]
      for(const item of content.items){
        if(typeof item.str!=='string'||!item.str.trim())continue
        const y=item.transform[5],existing=rows.find(row=>Math.abs(row.y-y)<2.5)
        if(existing)existing.items.push({x:item.transform[4],text:item.str})
        else rows.push({y,items:[{x:item.transform[4],text:item.str}]})
      }
      let method='text'
      if(rows.reduce((sum,row)=>sum+row.items.reduce((s,item)=>s+item.text.length,0),0)<70||workerData.forceOcr){
        parentPort.postMessage({progress:{page:number,total:document.numPages,stage:'ocr'}})
        if(!ocr){const {createWorker}=require('tesseract.js'),language=require('@tesseract.js-data/eng');ocr=await createWorker('eng',1,{langPath:language.langPath,gzip:true,cacheMethod:'none'})}
        const scale=Math.min(2,2000/viewport.width),view=page.getViewport({scale}),canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height))
        await page.render({canvasContext:canvas.getContext('2d'),canvas,viewport:view}).promise
        const result=await ocr.recognize(canvas.toBuffer('image/png'),{},{blocks:true,text:true})
        rows.length=0
        for(const block of result.data.blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[])for(const word of line.words||[]){
          const y=viewport.height-word.bbox.y1/scale,x=word.bbox.x0/scale
          const existing=rows.find(row=>Math.abs(row.y-y)<4)
          if(existing)existing.items.push({x,text:word.text});else rows.push({y,items:[{x,text:word.text}]})
        }
        method='ocr'
      }
      rows.sort((a,b)=>b.y-a.y).forEach(row=>row.items.sort((a,b)=>a.x-b.x))
      pages.push({number,method,rows})
      parentPort.postMessage({progress:{page:number,total:document.numPages,stage:method}})
      page.cleanup()
    }
    return {...extractFields(pages),pageCount:document.numPages,pages:pages.map(page=>({number:page.number,method:page.method,text:page.rows.map(row=>row.items.map(item=>item.text).join(' | ')).join('\n').slice(0,50000)}))}
  }finally{if(ocr)await ocr.terminate();await task.destroy()}
}
run().then(result=>parentPort.postMessage({result})).catch(error=>parentPort.postMessage({error:error?.name==='PasswordException'?'This PDF is password-protected. Import an unlocked copy.':String(error?.message||'Could not read this PDF.').slice(0,500)}))
