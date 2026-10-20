'use strict'
const crypto = require('node:crypto')
const { cleanUrl } = require('./reader-service.cjs')
const STATES = ['unread', 'reading', 'finished', 'archived']
const CONTENT = ['pending', 'ready', 'unavailable']
const MAX_ARTICLES = 5000
function emptyStore() { return { version: 1, articles: [], feeds: [] } }
function validateStore(store) {
  if (store?.version !== 1 || !Array.isArray(store.articles) || !Array.isArray(store.feeds) || store.articles.length > MAX_ARTICLES || store.feeds.length > 50) throw new Error('Unsupported or damaged Reader archive.')
  const ids = new Set(), urls = new Set()
  for (const article of store.articles) {
    if (!article || typeof article.id !== 'string' || ids.has(article.id) || urls.has(article.url) || typeof article.title !== 'string' || article.title.length > 500 || !STATES.includes(article.state) || !CONTENT.includes(article.contentStatus) || typeof article.saved !== 'boolean' || typeof article.starred !== 'boolean' || !Number.isFinite(article.progress) || article.progress < 0 || article.progress > 1 || !Array.isArray(article.feedIds) || article.feedIds.some(id => typeof id !== 'string') || !Array.isArray(article.tags) || article.tags.length > 10 || article.tags.some(tag => typeof tag !== 'string' || tag.length > 40) || !Array.isArray(article.blocks) || article.blocks.length > 1000 || article.blocks.some(block => !['paragraph', 'heading', 'quote', 'code'].includes(block.type) || typeof block.text !== 'string') || article.blocks.reduce((sum, block) => sum + block.text.length, 0) > 160000) throw new Error('Invalid article archive.')
    cleanUrl(article.url)
    ids.add(article.id); urls.add(article.url)
  }
  const feedIds = new Set()
  for (const feed of store.feeds) {
    if (!feed || typeof feed.id !== 'string' || feedIds.has(feed.id) || typeof feed.title !== 'string' || feed.title.length > 200) throw new Error('Invalid subscription archive.')
    cleanUrl(feed.url); feedIds.add(feed.id)
  }
  if (Buffer.byteLength(JSON.stringify(store)) > 30 * 1024 * 1024) throw new Error('Reader library exceeds 30 MB. Export your library before adding more cached articles.')
  return store
}
function createArticle(input, now) {
  const url = cleanUrl(input.url)
  return { id: crypto.randomUUID(), url, title: String(input.title || new URL(url).hostname).slice(0, 500), siteName: new URL(url).hostname.replace(/^www\./, ''), author: String(input.author || '').slice(0, 200), excerpt: String(input.excerpt || '').slice(0, 1500), publishedAt: input.publishedAt || null, addedAt: now, updatedAt: now, lastReadAt: null, fetchedAt: null, feedIds: [], saved: false, starred: false, state: 'unread', progress: 0, tags: [], blocks: [], contentStatus: 'pending', fetchError: '', wordCount: null, readingMinutes: null }
}
function updateArticle(article, patch) {
  if (!patch || typeof patch !== 'object') throw new Error('Invalid article update.')
  if (patch.state !== undefined) {
    if (!STATES.includes(patch.state)) throw new Error('Invalid reading state.')
    article.state = patch.state
    if (patch.state === 'finished') { article.progress = 1; article.lastReadAt = new Date().toISOString() }
    if (patch.state === 'unread') article.progress = 0
  }
  for (const field of ['saved', 'starred']) if (patch[field] !== undefined) {
    if (typeof patch[field] !== 'boolean') throw new Error('Invalid bookmark state.')
    article[field] = patch[field]
  }
  if (patch.starred === true) article.saved = true
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || patch.tags.length > 10 || patch.tags.some(tag => typeof tag !== 'string' || tag.length > 40)) throw new Error('Use up to 10 tags, each at most 40 characters.')
    article.tags = [...new Set(patch.tags.map(tag => tag.trim()).filter(Boolean))]
  }
  if (patch.progress !== undefined) {
    if (!Number.isFinite(patch.progress) || patch.progress < 0 || patch.progress > 1) throw new Error('Invalid reading progress.')
    article.progress = patch.progress
    article.lastReadAt = new Date().toISOString()
    // Reaching the bottom does not mark an article finished; that remains an explicit action.
    if (article.state === 'unread' && patch.progress > 0) article.state = 'reading'
  }
}
function mutate(store, action) {
  validateStore(store)
  if (!action || typeof action !== 'object') throw new Error('Invalid Reader action.')
  const next = structuredClone(store), now = new Date().toISOString()
  if (action.type === 'save') {
    const url = cleanUrl(action.url)
    let article = next.articles.find(article => article.url === url)
    if (!article) { article = createArticle({ url }, now); next.articles.unshift(article) }
    article.saved = true
    if (article.state === 'archived') article.state = 'unread'
  } else if (action.type === 'update') {
    const article = next.articles.find(article => article.id === action.id)
    if (!article) throw new Error('Article no longer exists.')
    updateArticle(article, action.patch)
    article.updatedAt = now
  } else if (action.type === 'cache') {
    const article = next.articles.find(article => article.id === action.id)
    if (!article) throw new Error('Article no longer exists.')
    const data = action.article
    // Called only by the main process with extraction results, never exposed as an IPC action.
    for (const key of ['title', 'author', 'siteName', 'excerpt', 'publishedAt', 'blocks', 'contentStatus', 'fetchError', 'fetchedAt', 'wordCount', 'readingMinutes']) if (data[key] !== undefined && data[key] !== null) article[key] = data[key]
    article.updatedAt = now
  } else if (action.type === 'feed') {
    const incoming = action.feed
    const url = cleanUrl(incoming.url)
    let feed = next.feeds.find(feed => feed.url === url || feed.id === action.id)
    if (!feed) { feed = { id: crypto.randomUUID(), url, title: String(incoming.title).slice(0, 200), addedAt: now, lastFetchedAt: null, error: '' }; next.feeds.push(feed) }
    feed.lastFetchedAt = now; feed.error = ''; feed.title = String(incoming.title).slice(0, 200); feed.url = url
    for (const item of incoming.items.slice(0, 100)) {
      let article = next.articles.find(article => article.url === item.url)
      if (!article) {
        if (next.articles.length >= MAX_ARTICLES) { feed.error = 'Article limit reached; new headlines were skipped.'; continue }
        article = createArticle(item, now); next.articles.push(article)
      }
      if (!article.feedIds.includes(feed.id)) article.feedIds.push(feed.id)
    }
  } else if (action.type === 'feed-error') {
    const feed = next.feeds.find(feed => feed.id === action.id)
    if (!feed) throw new Error('Subscription no longer exists.')
    feed.error = String(action.error || 'Refresh failed.').slice(0, 500)
  } else if (action.type === 'unsubscribe') {
    // Retain article text, bookmarks and history. Only the subscription is removed.
    next.feeds = next.feeds.filter(feed => feed.id !== action.id)
  } else throw new Error('Unknown Reader action.')
  return validateStore(next)
}
module.exports = { emptyStore, validateStore, mutate }
