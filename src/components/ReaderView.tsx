import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Archive, ArrowLeft, ArrowUpRight, BookOpen, Bookmark, Check, CheckCheck, Clock3, Download, History, Inbox, LoaderCircle, Plus, RefreshCw, Rss, Search, Star, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { relativeTime } from '@/lib/format'
import type { ReaderArticle } from '@/types'
import type { useReader } from '@/lib/use-reader'

type ReaderModel = ReturnType<typeof useReader>
type ReaderRequest = { kind: 'save' | 'subscribe' | 'search'; serial: number }
type Scope = 'saved' | 'feeds' | 'all' | 'starred' | 'history' | 'archive' | `feed:${string}`
const scopeNames: Record<string,string> = { saved:'Saved articles', feeds:'All feeds', all:'All articles', starred:'Starred', history:'Reading history', archive:'Archive' }
const dayLabel = (value: string) => new Date(value).toLocaleDateString(undefined, {month:'short',day:'numeric'})
function articleTitle(article: ReaderArticle) {
  const title = article.title.trim(), site = article.siteName.trim()
  const normalise = (value:string) => value.toLowerCase().replace(/[–—]/g,'-')
  return site && title.length > site.length + 4 && normalise(title).endsWith(normalise(site))
    ? title.slice(0,-site.length).replace(/\s*[-–—|:]\s*$/,'').trim() : title
}
export function ReaderView({ reader, request }: { reader: ReaderModel; request: ReaderRequest }) {
  const [scope, setScope] = useState<Scope>('saved')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'save' | 'subscribe' | 'tags' | 'unsubscribe' | null>(null)
  const [url, setUrl] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [formError, setFormError] = useState('')
  const [preferences, setPreferences] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem('openfit:reader-display') || '{}'); return { size: [16,18,20,22,24].includes(value.size) ? value.size as number : 18, paper: value.paper === 'sepia' ? 'sepia' : 'dark', serif: value.serif !== false } } catch { return {size:18,paper:'dark',serif:true} }
  })
  useEffect(() => { try { localStorage.setItem('openfit:reader-display',JSON.stringify(preferences)) } catch { /* Session-only preferences if storage is unavailable. */ } }, [preferences])
  const searchRef = useRef<HTMLInputElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const pendingProgress = useRef<{id:string; value:number} | null>(null)
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredId = useRef<string | null>(null)
  const lastRequest = useRef(0)
  const articles = reader.store.articles
  const feeds = reader.store.feeds
  const activeFeedIds = new Set(feeds.map(feed => feed.id))
  const article = articles.find(article => article.id === selectedId) ?? null
  const activeFeed = scope.startsWith('feed:') ? feeds.find(feed => feed.id === scope.slice(5)) : null
  const unreadCount = (id?:string) => articles.filter(article => article.state === 'unread' && (id ? article.feedIds.includes(id) : article.saved)).length
  const flushProgress = () => {
    if (progressTimer.current) clearTimeout(progressTimer.current)
    const pending = pendingProgress.current
    pendingProgress.current = null
    if (pending) void reader.perform({type:'mutate', action:{type:'update', id:pending.id, patch:{progress:pending.value}}})
  }
  useEffect(() => () => { flushProgress() }, [])
  const openDialog = (kind:'save'|'subscribe') => { setUrl(''); setFormError(''); setDialog(kind) }
  useEffect(() => {
    if (!request.serial || request.serial === lastRequest.current) return
    lastRequest.current = request.serial
    if (request.kind === 'search') searchRef.current?.focus()
    else openDialog(request.kind)
  }, [request])
  useEffect(() => {
    const shortcut = (event:KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName))) return
      if (dialog) return
      if (event.key === '/') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); openDialog('save') }
      if (event.key === 'Escape') { flushProgress(); setSelectedId(null) }
    }
    window.addEventListener('keydown',shortcut)
    return () => window.removeEventListener('keydown',shortcut)
  }, [dialog])
  useEffect(() => {
    const pane = paneRef.current
    if (!article || !pane || restoredId.current === article.id || article.contentStatus === 'pending') return
    restoredId.current = article.id
    pane.scrollTop = article.progress * Math.max(0,pane.scrollHeight-pane.clientHeight)
  }, [article?.id,article?.contentStatus])
  const patchArticle = (target:ReaderArticle, patch:Partial<Pick<ReaderArticle,'state'|'starred'|'saved'|'tags'>>) => {
    flushProgress()
    void reader.perform({type:'mutate',action:{type:'update',id:target.id,patch}})
  }
  const openArticle = async (target:ReaderArticle) => {
    flushProgress(); restoredId.current = null; setSelectedId(target.id)
    await reader.perform({type:'mutate',action:{type:'update',id:target.id,patch:{...(target.state === 'unread' ? {state:'reading' as const}:{}),progress:target.progress}}})
    if (target.contentStatus === 'pending') await reader.perform({type:'fetch',id:target.id})
  }
  const changeScope = (value:Scope) => { flushProgress(); setScope(value); setSelectedId(null); setFilter('all'); setQuery('') }
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const filtered = articles.filter(item => {
    if (scope === 'archive' ? item.state !== 'archived' : item.state === 'archived') return false
    if (scope === 'saved' && !item.saved || scope === 'starred' && !item.starred || scope === 'history' && !item.lastReadAt && item.state !== 'reading' && item.state !== 'finished') return false
    if (scope === 'feeds' && !item.feedIds.some(id => activeFeedIds.has(id)) || scope.startsWith('feed:') && !item.feedIds.includes(scope.slice(5))) return false
    if (filter !== 'all' && item.state !== filter) return false
    return words.every(word => `${item.title} ${item.excerpt} ${item.siteName} ${item.author} ${item.tags.join(' ')} ${item.blocks.map(block=>block.text).join(' ')}`.toLowerCase().includes(word))
  }).sort((a,b) => sort === 'shortest' ? (a.readingMinutes ?? Infinity)-(b.readingMinutes ?? Infinity) : sort === 'oldest' ? a.addedAt.localeCompare(b.addedAt) : scope === 'history' ? (b.lastReadAt || b.updatedAt).localeCompare(a.lastReadAt || a.updatedAt) : (b.publishedAt || b.addedAt).localeCompare(a.publishedAt || a.addedAt))
  const submit = async (event:FormEvent) => {
    event.preventDefault(); setFormError('')
    if (dialog === 'tags' && article) {
      const tags = tagDraft.split(',').map(tag=>tag.trim()).filter(Boolean)
      if (tags.length > 10 || tags.some(tag=>tag.length>40)) { setFormError('Use up to 10 tags, each at most 40 characters.'); return }
      const result = await reader.perform({type:'mutate',action:{type:'update',id:article.id,patch:{tags}}})
      if (result) setDialog(null)
      return
    }
    const result = await reader.perform({type:dialog === 'subscribe' ? 'subscribe':'save',url:url.trim()})
    if (!result) return
    setDialog(null); setQuery(''); setFilter('all')
    if (dialog === 'subscribe') { setScope('feeds'); setSelectedId(null) }
    else { setScope('saved'); if (result.articleId) { restoredId.current=null; setSelectedId(result.articleId) } }
  }
  const openOriginal = () => {
    if (!article) return
    if (window.fitbit) void window.fitbit.openExternal(article.url)
    else window.open(article.url,'_blank','noopener,noreferrer')
  }
  return <div className="reader-page">
    <header className="reader-heading">
      <div><span className="reader-kicker"><BookOpen size={14}/> A little space for curiosity</span><h2>Your next good read.</h2><p>Keep what matters. Follow what interests you. Read at your own pace.</p></div>
      <div className="reader-heading-actions"><Button variant="outline" disabled={reader.busy || reader.loading || !window.reader} onClick={()=>openDialog('subscribe')}><Rss/> Add feed</Button><Button disabled={reader.busy || reader.loading || !window.reader} onClick={()=>openDialog('save')}><Plus/> Save article</Button></div>
    </header>
    {reader.error && <div className="reader-error" role="alert"><span>{reader.error}</span><Button variant="ghost" onClick={()=>void reader.reload()}>Reload library</Button></div>}
    <div className={`reader-layout ${article ? 'has-selection':''}`}>
      <aside className="reader-rail" aria-label="Reading collections">
        <span className="reader-section-label">YOUR LIBRARY</span>
        {([{id:'saved',name:'Saved articles',icon:Bookmark,count:articles.filter(a=>a.saved && a.state!=='archived').length},{id:'starred',name:'Starred',icon:Star,count:articles.filter(a=>a.starred && a.state!=='archived').length},{id:'history',name:'History',icon:History},{id:'all',name:'All articles',icon:Inbox,count:articles.filter(a=>a.state!=='archived').length},{id:'archive',name:'Archive',icon:Archive}] as const).map(item=><button key={item.id} className={scope===item.id?'is-active':''} aria-current={scope===item.id?'page':undefined} onClick={()=>changeScope(item.id)}><item.icon/><span>{item.name}</span>{'count' in item && <small>{item.count}</small>}</button>)}
        <div className="reader-feed-label"><span className="reader-section-label">SUBSCRIPTIONS</span><button aria-label="Add RSS subscription" onClick={()=>openDialog('subscribe')}><Plus/></button></div>
        <button className={scope==='feeds'?'is-active':''} onClick={()=>changeScope('feeds')}><Rss/><span>All feeds</span><small>{feeds.length}</small></button>
        <div className="reader-feed-list">{feeds.map(feed=><button key={feed.id} className={scope===`feed:${feed.id}`?'is-active':''} title={feed.error || feed.url} onClick={()=>changeScope(`feed:${feed.id}`)}><span className={`reader-feed-dot ${feed.error?'has-error':''}`}/><span>{feed.title}</span><small>{articles.filter(a=>a.feedIds.includes(feed.id) && a.state==='unread').length || ''}</small></button>)}</div>
        {!feeds.length && <p className="reader-rail-hint">A quieter feed.<br/>Only sources you choose.</p>}
        <div className="reader-local-note"><span className="reader-local-dot"/> Local library <small>{articles.filter(a=>a.contentStatus==='ready').length} articles cached offline</small></div>
      </aside>
      <section className="reader-list" aria-label="Articles">
        <div className="reader-list-head"><div><h3>{activeFeed?.title || scopeNames[scope] || 'Articles'}</h3><span>{filtered.length} articles{scope==='saved' && unreadCount() ? ` · ${unreadCount()} unread`:''}</span></div><button className={reader.busy?'is-working':''} disabled={reader.busy || !feeds.length} onClick={()=>void reader.perform({type:'refresh',id:activeFeed?.id})} aria-label="Refresh RSS feeds" title="Refresh RSS feeds">{reader.busy?<LoaderCircle className="spin"/>:<RefreshCw/>}</button></div>
        <label className="reader-search"><Search/><input ref={searchRef} type="search" placeholder="Search your reading…" aria-label="Search articles" value={query} onChange={event=>setQuery(event.target.value)}/><kbd>/</kbd></label>
        <div className="reader-list-filters"><select aria-label="Filter reading state" value={filter} onChange={event=>setFilter(event.target.value)}><option value="all">All states</option><option value="unread">Unread</option><option value="reading">Reading</option><option value="finished">Finished</option>{scope==='archive' && <option value="archived">Archived</option>}</select><select aria-label="Sort articles" value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="shortest">Shortest read</option></select></div>
        {activeFeed && <div className="reader-feed-status"><span>{activeFeed.lastFetchedAt?`Updated ${relativeTime(activeFeed.lastFetchedAt)}`:'Not refreshed yet'}</span><button disabled={reader.busy} onClick={()=>setDialog('unsubscribe')}>Unsubscribe</button>{activeFeed.error && <p role="status">{activeFeed.error}</p>}</div>}
        {feeds.some(feed=>feed.error) && !activeFeed && <p className="reader-feed-warning" role="status">Some feeds could not refresh. Open the subscription to see details; previous headlines are retained.</p>}
        <div className="reader-article-list">
          {reader.loading ? <div className="reader-empty"><LoaderCircle className="spin"/><h4>Opening your library…</h4></div> : filtered.length ? filtered.map(item=><article key={item.id} className={`reader-item ${item.id===selectedId?'is-selected':''} ${item.state==='finished'?'is-finished':''}`}>
            <button className="reader-item-open" onClick={()=>void openArticle(item)} aria-label={`Read ${item.title}`}><span className="reader-item-source"><i className={item.state==='unread'?'is-unread':''}/>{new URL(item.url).hostname.replace(/^www\./,'')}<time>{dayLabel(item.publishedAt || item.addedAt)}</time></span><h4>{articleTitle(item)}</h4>{item.excerpt && <p>{item.excerpt}</p>}<span className="reader-item-meta">{item.contentStatus==='ready'?<><Clock3/>{item.readingMinutes} min read</>:<><Rss/>Link & excerpt</>}<span>{item.state==='reading'?`${Math.round(item.progress*100)}% read`:item.state==='finished'?'Finished':item.state==='archived'?'Archived':''}</span></span>{item.state==='reading' && <span className="reader-item-progress"><i style={{width:`${item.progress*100}%`}}/></span>}</button>
            <button className={`reader-item-star ${item.starred?'is-starred':''}`} aria-label={`${item.starred?'Unstar':'Star'} ${item.title}`} aria-pressed={item.starred} disabled={reader.busy} onClick={()=>patchArticle(item,{starred:!item.starred})}><Star/></button>
          </article>) : <div className="reader-empty"><BookOpen/><h4>{query?'No matching reads':scope==='saved'?'Start a small collection.':'Nothing here yet.'}</h4><p>{query?'Try a title, author, source, tag or phrase.':scope==='feeds'?'Subscribe to a site’s RSS or Atom feed. New headlines will arrive when you refresh.':'Save an article you want to come back to, or explore a feed.'}</p>{!query && <button onClick={()=>openDialog(scope==='feeds'?'subscribe':'save')}>{scope==='feeds'?'Add your first feed':'Save an article'} <ArrowUpRight/></button>}</div>}
        </div>
      </section>
      <section className={`reader-pane reader-paper-${preferences.paper}`} aria-label="Article reader">
        {article ? <>
          <div className="reader-pane-toolbar"><button className="reader-back" aria-label="Back to articles" onClick={()=>{flushProgress();setSelectedId(null)}}><ArrowLeft/></button><button title={article.saved?'Remove from saved':'Save for later'} aria-label={article.saved?'Remove from saved':'Save for later'} aria-pressed={article.saved} disabled={reader.busy} onClick={()=>patchArticle(article,{saved:!article.saved})}><Bookmark className={article.saved?'is-filled':''}/></button><button title="Star article" aria-label="Star article" aria-pressed={article.starred} disabled={reader.busy} onClick={()=>patchArticle(article,{starred:!article.starred})}><Star className={article.starred?'is-filled':''}/></button><button title={article.state==='finished'?'Mark unread':'Mark finished'} aria-label={article.state==='finished'?'Mark unread':'Mark finished'} disabled={reader.busy} onClick={()=>patchArticle(article,{state:article.state==='finished'?'unread':'finished'})}><CheckCheck className={article.state==='finished'?'is-accent':''}/></button><button title={article.state==='archived'?'Restore article':'Archive article'} aria-label={article.state==='archived'?'Restore article':'Archive article'} disabled={reader.busy} onClick={()=>patchArticle(article,{state:article.state==='archived'?'unread':'archived'})}><Archive/></button><span className="reader-toolbar-spacer"/><button aria-label="Decrease reading font size" disabled={preferences.size<=16} onClick={()=>setPreferences({...preferences,size:preferences.size-2})}>A−</button><button aria-label="Increase reading font size" disabled={preferences.size>=24} onClick={()=>setPreferences({...preferences,size:preferences.size+2})}>A+</button><button aria-label="Toggle serif font" aria-pressed={preferences.serif} onClick={()=>setPreferences({...preferences,serif:!preferences.serif})}><Type/></button><button title="Switch reading theme" aria-label="Switch reading theme" onClick={()=>setPreferences({...preferences,paper:preferences.paper==='dark'?'sepia':'dark'})}><span className="reader-theme-swatch"/></button><button title="Open original in browser" aria-label="Open original in browser" onClick={openOriginal}><ArrowUpRight/></button></div>
          <div className="reader-scroll" ref={paneRef} onScroll={event=>{
            const pane=event.currentTarget, range=pane.scrollHeight-pane.clientHeight
            if (!article || article.contentStatus!=='ready' || range<=0 || restoredId.current!==article.id) return
            const progress=Math.min(1,Math.max(0,pane.scrollTop/range))
            if (Math.abs(progress-article.progress)<.015) return
            pendingProgress.current={id:article.id,value:progress}
            if (progressTimer.current) clearTimeout(progressTimer.current)
            progressTimer.current=setTimeout(flushProgress,1200)
          }}>
            <div className="reader-prose" style={{'--reader-font-size':`${preferences.size}px`,'--reader-font':preferences.serif?'Georgia, "Times New Roman", serif':'var(--font-sans, sans-serif)'} as CSSProperties}>
              <span className="reader-article-source">{article.siteName}{article.publishedAt?` · ${dayLabel(article.publishedAt)}`:''}</span><h1>{articleTitle(article)}</h1><div className="reader-byline">{article.author && <span>{article.author}</span>}{article.readingMinutes && <span>{article.readingMinutes} min read · {article.wordCount?.toLocaleString()} words</span>}</div>
              <div className="reader-tags">{article.tags.map(tag=><button key={tag} onClick={()=>setQuery(tag)}>#{tag}</button>)}<button onClick={()=>{setTagDraft(article.tags.join(', '));setFormError('');setDialog('tags')}}>{article.tags.length?'+ Edit tags':'+ Add tags'}</button></div>
              {article.contentStatus==='ready' ? <div className="reader-article-body">{article.blocks.map((block,index)=>block.type==='heading'?<h2 key={index}>{block.text}</h2>:block.type==='quote'?<blockquote key={index}>{block.text}</blockquote>:block.type==='code'?<pre key={index}><code>{block.text}</code></pre>:<p key={index}>{block.text}</p>)}</div> : <div className="reader-extraction-state">{article.excerpt && <p>{article.excerpt}</p>}{reader.busy?<><LoaderCircle className="spin"/><span>Fetching readable text…</span></>:<><p>{article.fetchError || 'This feed includes a headline and excerpt. Fetch the article to read it here and keep an offline copy.'}</p><Button variant="outline" onClick={()=>void reader.perform({type:'fetch',id:article.id})}><Download/> {article.contentStatus==='unavailable'?'Retry readable text':'Fetch article'}</Button><button onClick={openOriginal}>Open original <ArrowUpRight/></button></>}</div>}
              {article.contentStatus !== 'pending' && <div className="reader-endnote"><span>YOU’VE REACHED THE END</span><button disabled={reader.busy} onClick={()=>patchArticle(article,{state:article.state==='finished'?'unread':'finished'})}><Check/>{article.state==='finished'?'Finished · mark unread':'Mark as finished'}</button><p>{article.contentStatus==='ready'?`Text cached ${article.fetchedAt?dayLabel(article.fetchedAt):'locally'}. Images and embeds are omitted for a quieter read.`:'Only the saved link and available excerpt are stored.'}</p><button className="reader-original-link" onClick={openOriginal}>Visit the original publication <ArrowUpRight/></button></div>}
            </div>
          </div>
        </> : <div className="reader-welcome"><div className="reader-book-art"><BookOpen/><span/></div><span className="reader-section-label">LESS SCROLLING. MORE READING.</span><h3>Let something<br/>catch your mind.</h3><p>Choose an article from your collection,<br/>or bring a favourite publication along.</p><div><button onClick={()=>openDialog('save')}><Bookmark/> Save a link</button><button onClick={()=>openDialog('subscribe')}><Rss/> Follow a feed</button></div><small>No algorithm. Just your curiosity.</small></div>}
      </section>
    </div>
    <footer className="reader-footer"><span>{reader.busy?<><LoaderCircle className="spin"/> Working…</>:<><span className="reader-local-dot"/> Saved on this device</>}<small>N to save · / to search · Esc to close article</small></span><details><summary>Storage & reading preferences</summary><p>Your library, article text, subscriptions and reading progress are encrypted in OpenFit’s local app-data directory, with one previous-version backup. Feeds refresh only when you request it, up to 100 headlines per feed per refresh. Cached text works offline. Some publishers require their website or subscription; Reader does not bypass access restrictions. Subscriptions can be removed without deleting article history. JSON exports are unencrypted.</p><div><Button variant="ghost" disabled={reader.busy || reader.loading} onClick={()=>void reader.perform({type:'export'})}><Download/> Export library</Button><Button variant="ghost" disabled={reader.busy || reader.loading} onClick={()=>void reader.perform({type:'recover'})}>Recover backup</Button></div></details></footer>
    <Dialog open={dialog!==null} onOpenChange={open=>{if(!open && !reader.busy)setDialog(null)}}><DialogContent className="reader-dialog"><DialogTitle>{dialog==='subscribe'?'Follow a publication':dialog==='tags'?'Organise this article':dialog==='unsubscribe'?'Remove this subscription?':'Save something worth reading'}</DialogTitle><DialogDescription>{dialog==='subscribe'?'Paste an RSS or Atom feed URL, or a site that advertises one.':dialog==='tags'?'Use comma-separated tags to find related reads later.':dialog==='unsubscribe'?'Saved articles, cached text and reading history will remain in All articles.':'Paste an article URL. We’ll save the link and try to extract a clean, offline reading copy.'}</DialogDescription>
      {dialog==='unsubscribe'?<div className="reader-dialog-actions"><Button variant="outline" onClick={()=>setDialog(null)}>Keep subscription</Button><Button disabled={reader.busy} onClick={async()=>{if(activeFeed && await reader.perform({type:'mutate',action:{type:'unsubscribe',id:activeFeed.id}})){setDialog(null);changeScope('feeds')}}}>Unsubscribe</Button></div>:<form onSubmit={submit}><label>{dialog==='tags'?'Tags':'URL'}<input autoFocus type={dialog==='tags'?'text':'url'} required={dialog!=='tags'} maxLength={dialog==='tags'?420:4096} placeholder={dialog==='tags'?'engineering, ideas, health':'https://…'} value={dialog==='tags'?tagDraft:url} onChange={event=>dialog==='tags'?setTagDraft(event.target.value):setUrl(event.target.value)} disabled={reader.busy}/></label>{dialog==='subscribe' && <div className="reader-feed-suggestions"><span>Try a source</span><button type="button" onClick={()=>setUrl('https://news.ycombinator.com/rss')}>Hacker News</button><button type="button" onClick={()=>setUrl('https://hacks.mozilla.org/feed/')}>Mozilla Hacks</button></div>}{(formError || reader.error) && <p className="reader-form-error" role="alert">{formError || reader.error}</p>}<Button type="submit" disabled={reader.busy || !window.reader || dialog!=='tags' && !url.trim()}>{reader.busy?<><LoaderCircle className="spin"/> {dialog==='subscribe'?'Finding feed…':'Saving…'}</>:dialog==='subscribe'?<><Rss/> Subscribe</>:dialog==='tags'?'Save tags':<><Bookmark/> Save article</>}</Button></form>}
    </DialogContent></Dialog>
  </div>
}
