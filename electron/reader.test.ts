import { createRequire } from 'node:module'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
const require = createRequire(import.meta.url)
const service = require('./reader-service.cjs')
const store = require('./reader-store.cjs')
const https = require('node:https')
const dns = require('node:dns').promises
const url = 'https://publication.example/story'
const feedUrl = 'https://publication.example/feed'
const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Engineering &amp; Ideas</title><item><title>A useful article</title><link>${url}#comments</link><description><![CDATA[<p>A small <b>idea</b>.</p><script>bad()</script>]]></description><pubDate>Mon, 19 Oct 2026 08:00:00 GMT</pubDate></item><item><title>No link</title></item><item><title>Bad URL</title><link>javascript:alert(1)</link></item></channel></rss>`
const story = `<html><head><title>A useful article</title><meta name="author" content="Ada"/></head><body><nav>Navigation</nav><article><h1>A useful article</h1><p>${'A careful explanation about reading and software engineering. '.repeat(20)}</p><h2>Another perspective</h2><p>${'Taking time to read makes room for a different perspective. '.repeat(20)}</p><script>globalThis.readerInjected = true</script><iframe src="http://127.0.0.1/secret"></iframe></article></body></html>`
afterEach(()=>vi.restoreAllMocks())
describe('Reader parsing and network boundaries',()=>{
  it('reads RSS with CDATA, cleans summaries and skips unsafe entry URLs',()=>{
    const feed=service.parseFeed(rss,feedUrl)
    expect(feed.title).toBe('Engineering & Ideas')
    expect(feed.items).toHaveLength(1)
    expect(feed.items[0]).toMatchObject({url,title:'A useful article',excerpt:'A small idea.',publishedAt:'2026-10-19T08:00:00.000Z'})
  })
  it('reads namespaced Atom links and resolves relative URLs',()=>{
    const result=service.parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Notes</title><entry><title>New note</title><link rel="self" href="/api"/><link rel="alternate" href="/note"/><summary>Some context</summary><author><name>Ada</name></author></entry></feed>`,feedUrl)
    expect(result.items[0]).toMatchObject({url:'https://publication.example/note',author:'Ada'})
    expect(service.discoverFeed('<html><head><link rel="alternate" type="application/rss+xml" href="/rss"/></head></html>',url)).toBe('https://publication.example/rss')
  })
  it('rejects malformed feeds and entity declarations',()=>{
    expect(()=>service.parseFeed('<html>not a feed</html>',feedUrl)).toThrow()
    expect(()=>service.parseFeed('<rss><channel>',feedUrl)).toThrow()
    expect(()=>service.parseFeed('<!DOCTYPE rss [<!ENTITY payload SYSTEM "file:///etc/passwd">]><rss/>',feedUrl)).toThrow(/entity/i)
  })
  it('extracts a readable offline copy without scripts, embeds or HTML execution',()=>{
    const article=service.extractArticle(story,url)
    expect(article.contentStatus).toBe('ready')
    expect(article.blocks.some((block:any)=>block.type==='heading' && block.text==='Another perspective')).toBe(true)
    expect(JSON.stringify(article.blocks)).not.toContain('readerInjected')
    expect(JSON.stringify(article.blocks)).not.toContain('127.0.0.1')
    expect(article.wordCount).toBeGreaterThan(200)
  })
  it('preserves a link-only fallback for pages without readable content',()=>{
    const article=service.extractArticle('<html><head><title>Login required</title></head><body>Sign in</body></html>',url)
    expect(article).toMatchObject({title:'Login required',contentStatus:'unavailable',blocks:[]})
  })
  it('blocks private URLs, credentials, special schemes and nonstandard ports',async()=>{
    for(const target of ['file:///etc/passwd','http://localhost/','http://127.1/','http://2130706433/','http://10.0.0.1/','http://169.254.169.254/latest','http://[::1]/','http://[::ffff:127.0.0.1]/','https://user:pass@example.com','https://example.com:8443']) expect(()=>service.cleanUrl(target)).toThrow()
    expect(service.publicAddress('8.8.8.8')).toBe(true)
    expect(service.publicAddress('192.168.1.1')).toBe(false)
    expect(service.publicAddress('2606:4700:4700::1111')).toBe(true)
    vi.spyOn(dns,'lookup').mockResolvedValue([{address:'10.0.0.2',family:4}])
    await expect(service.download('https://private.example')).rejects.toThrow(/private/)
  })
  it('pins public DNS results and rejects redirects to private addresses',async()=>{
    vi.spyOn(dns,'lookup').mockResolvedValue([{address:'8.8.8.8',family:4}])
    const get=vi.spyOn(https,'get').mockImplementation((target:any,options:any,callback:any)=>{
      expect(options.agent).toBe(false)
      options.lookup('public.example',{},(error:any,address:string)=>{expect(error).toBeNull();expect(address).toBe('8.8.8.8')})
      const request=new EventEmitter() as any
      request.destroy=(error:any)=>request.emit('error',error)
      queueMicrotask(()=>{
        const response=Readable.from([]) as any
        response.statusCode=302; response.headers={location:'http://127.0.0.1/secret'}
        callback(response);request.emit('close')
      })
      return request
    })
    await expect(service.download('https://public.example')).rejects.toThrow(/private-network/)
    expect(get).toHaveBeenCalledTimes(1)
  })
  it('limits download size before parsing untrusted content',async()=>{
    vi.spyOn(dns,'lookup').mockResolvedValue([{address:'8.8.8.8',family:4}])
    vi.spyOn(https,'get').mockImplementation((_target:any,_options:any,callback:any)=>{
      const request=new EventEmitter() as any; request.destroy=(error:any)=>request.emit('error',error)
      queueMicrotask(()=>{const response=Readable.from([]) as any;response.statusCode=200;response.headers={'content-length':'9000000','content-type':'text/html'};callback(response);request.emit('close')})
      return request
    })
    await expect(service.download('https://public.example')).rejects.toThrow(/3 MB/)
  })
})
describe('Reader library persistence rules',()=>{
  it('deduplicates saved links and feed articles without losing reading state',()=>{
    let next=store.mutate(store.emptyStore(),{type:'feed',feed:service.parseFeed(rss,feedUrl)})
    const id=next.articles[0].id
    next=store.mutate(next,{type:'update',id,patch:{state:'reading',progress:.45,tags:['engineering'],starred:true}})
    next=store.mutate(next,{type:'save',url:`${url}#top`})
    next=store.mutate(next,{type:'feed',feed:service.parseFeed(rss,feedUrl)})
    expect(next.articles).toHaveLength(1)
    expect(next.feeds).toHaveLength(1)
    expect(next.articles[0]).toMatchObject({id,saved:true,starred:true,progress:.45,tags:['engineering'],state:'reading'})
  })
  it('retains cached content and history when unsubscribing or archiving',()=>{
    let next=store.mutate(store.emptyStore(),{type:'feed',feed:service.parseFeed(rss,feedUrl)})
    const id=next.articles[0].id
    next=store.mutate(next,{type:'cache',id,article:service.extractArticle(story,url)})
    next=store.mutate(next,{type:'update',id,patch:{state:'finished'}})
    next=store.mutate(next,{type:'unsubscribe',id:next.feeds[0].id})
    expect(next.feeds).toHaveLength(0)
    expect(next.articles[0]).toMatchObject({state:'finished',progress:1,contentStatus:'ready'})
    next=store.mutate(next,{type:'update',id,patch:{state:'archived'}})
    next=store.mutate(next,{type:'update',id,patch:{state:'unread'}})
    expect(next.articles[0].blocks.length).toBeGreaterThan(0)
    expect(next.articles[0].progress).toBe(0)
  })
  it('rejects invalid updates without mutating the original archive',()=>{
    const original=store.mutate(store.emptyStore(),{type:'save',url})
    const id=original.articles[0].id
    expect(()=>store.mutate(original,{type:'update',id,patch:{progress:2}})).toThrow()
    expect(()=>store.mutate(original,{type:'update',id,patch:{tags:['a'.repeat(41)]}})).toThrow()
    expect(original.articles[0].progress).toBe(0)
    const next=store.mutate(original,{type:'update',id,patch:{url:'http://localhost',blocks:[{text:'injected'}]}})
    expect(next.articles[0].url).toBe(url)
    expect(next.articles[0].blocks).toEqual([])
  })
})
