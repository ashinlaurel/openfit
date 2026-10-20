'use strict'

const dns = require('node:dns').promises
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const { JSDOM, VirtualConsole } = require('jsdom')
const { Readability } = require('@mozilla/readability')

const MAX_BYTES = 3 * 1024 * 1024
function publicAddress(address) {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113)
  }
  // Accept global unicast IPv6 only. This also rejects mapped IPv4 and local/link-local ranges.
  return net.isIP(ip) === 6 && /^[23]/.test(ip) && !/^2001:(?:db8|0):/i.test(ip)
}
function cleanUrl(input, base) {
  if (typeof input !== 'string' || input.length > 4096) throw new Error('Enter a valid public article or feed URL.')
  let url
  try { url = new URL(input, base) } catch { throw new Error('Enter a full URL, starting with https://.') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) throw new Error('Only public HTTP and HTTPS URLs on standard ports are supported.')
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || net.isIP(host) && !publicAddress(host)) throw new Error('Local and private-network URLs are not supported.')
  url.hash = ''
  return url.toString()
}
async function download(input, redirects = 0) {
  const url = new URL(cleanUrl(input))
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await Promise.race([
    dns.lookup(host, { all: true }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), 8000); timer.unref() }),
  ])
  if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('This address resolves to a private or unsupported network.')
  const record = records[0]
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      headers: { 'user-agent': 'OpenFitReader/1.0', accept: 'text/html, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', 'accept-encoding': 'identity' },
      // Pin the checked address for this request; redirects are independently revalidated.
      lookup: (_hostname, options, callback) => options?.all ? callback(null, [record]) : callback(null, record.address, record.family),
      agent: false,
    }, response => {
      const status = response.statusCode || 0
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.resume()
        if (redirects >= 4) { reject(new Error('Too many redirects.')); return }
        let target
        try { target = cleanUrl(response.headers.location, url.toString()) } catch (error) { reject(error); return }
        download(target, redirects + 1).then(resolve, reject)
        return
      }
      if (status < 200 || status >= 300) { response.resume(); reject(new Error(`The publisher returned HTTP ${status}. You can still save the link and open it in your browser.`)); return }
      const contentType = String(response.headers['content-type'] || '')
      if (contentType && !/html|xml|text\/plain/i.test(contentType)) { response.resume(); reject(new Error('This URL is not an HTML article or XML feed.')); return }
      if (Number(response.headers['content-length']) > MAX_BYTES) { response.destroy(); reject(new Error('This page exceeds the 3 MB download limit.')); return }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') { response.destroy(); reject(new Error('The publisher returned an unsupported encoding.')); return }
      let size = 0
      const chunks = []
      response.on('data', chunk => {
        size += chunk.length
        if (size > MAX_BYTES) { response.destroy(new Error('This page exceeds the 3 MB download limit.')); return }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => {
        const bytes = Buffer.concat(chunks)
        const charset = contentType.match(/charset=["']?([^;\s"']+)/i)?.[1] || 'utf-8'
        let text
        try { text = new TextDecoder(charset).decode(bytes) } catch { text = bytes.toString('utf8') }
        resolve({ text, url: url.toString(), contentType })
      })
    })
    const timer = setTimeout(() => request.destroy(new Error('The publisher took too long to respond. Try again.')), 15000)
    request.once('close', () => clearTimeout(timer))
    request.on('error', reject)
  })
}
function dom(html, url, xml = false) {
  return new JSDOM(html, { url, contentType: xml ? 'text/xml' : 'text/html', virtualConsole: new VirtualConsole() })
}
function plain(html, limit = 2000) {
  const page = dom(String(html || '').slice(0, 200000), 'https://reader.invalid')
  try {
    page.window.document.querySelectorAll('script,style,iframe,object,embed,template').forEach(node => node.remove())
    return page.window.document.body.textContent.replace(/\s+/g, ' ').trim().slice(0, limit)
  } finally { page.window.close() }
}
function validDate(input) { const value = Date.parse(input || ''); return Number.isFinite(value) ? new Date(value).toISOString() : null }
function parseFeed(xml, sourceUrl) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Feeds containing document type or entity declarations are not supported.')
  let page
  try { page = dom(xml, sourceUrl, true) } catch { throw new Error('This is not a valid RSS or Atom feed. Paste the feed URL or a site with an RSS discovery link.') }
  try {
    const document = page.window.document
    const root = document.documentElement.localName.toLowerCase()
    if (!['rss', 'feed', 'rdf'].includes(root)) throw new Error('No RSS or Atom feed found at this URL.')
    const children = (node, name) => Array.from(node.children).filter(child => child.localName.toLowerCase() === name)
    const field = (node, name) => children(node, name)[0]?.textContent || ''
    const channel = root === 'rss' ? children(document.documentElement, 'channel')[0] : document.documentElement
    if (!channel) throw new Error('The feed has no channel.')
    const nodes = Array.from(document.getElementsByTagName('*')).filter(node => ['item', 'entry'].includes(node.localName.toLowerCase())).slice(0, 100)
    const items = []
    for (const node of nodes) {
      const link = children(node, 'link').find(link => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate')
      let candidate = link?.getAttribute('href') || link?.textContent || ''
      if (!candidate && children(node, 'guid')[0]?.getAttribute('isPermaLink') !== 'false') candidate = field(node, 'guid')
      if (!candidate.trim()) continue
      let url
      try { url = cleanUrl(candidate.trim(), sourceUrl) } catch { continue }
      const summary = field(node, 'description') || field(node, 'summary') || field(node, 'encoded') || field(node, 'content')
      items.push({ url, title: plain(field(node, 'title'), 500) || new URL(url).hostname, author: plain(field(node, 'creator') || field(node, 'author'), 200), excerpt: plain(summary, 1500), publishedAt: validDate(field(node, 'pubdate') || field(node, 'published') || field(node, 'updated') || field(node, 'date')) })
    }
    return { url: cleanUrl(sourceUrl), title: plain(field(channel, 'title'), 200) || new URL(sourceUrl).hostname, items }
  } finally { page.window.close() }
}
function discoverFeed(html, url) {
  const page = dom(html, url)
  try {
    for (const link of page.window.document.querySelectorAll('link[rel~="alternate"][href]')) {
      if (/rss|atom|application\/(?:feed\+)?json/i.test(link.getAttribute('type') || '') && !/json/i.test(link.getAttribute('type') || '')) {
        try { return cleanUrl(link.getAttribute('href'), url) } catch { /* Try the next public candidate. */ }
      }
    }
    throw new Error('No RSS or Atom feed was advertised by this site. Paste its feed URL instead.')
  } finally { page.window.close() }
}
async function fetchFeed(input) {
  const response = await download(input)
  if (/html/i.test(response.contentType) || /^\s*<!doctype html|<html[\s>]/i.test(response.text)) {
    const feed = await download(discoverFeed(response.text, response.url))
    return parseFeed(feed.text, feed.url)
  }
  return parseFeed(response.text, response.url)
}
function extractArticle(html, url) {
  const page = dom(html, url)
  try {
    const document = page.window.document
    const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    const title = plain(document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title, 500) || new URL(url).hostname
    const description = plain(document.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute('content'), 1500)
    const article = new Readability(document, { maxElemsToParse: 30000, charThreshold: 180 }).parse()
    if (!article || !article.textContent || article.textContent.trim().length < 180) return { title, excerpt: description, blocks: [], contentStatus: 'unavailable', fetchError: 'Readable text was not available. Open the original article in your browser.' }
    const content = dom(article.content, url)
    let remaining = 160000
    const blocks = []
    try {
      content.window.document.querySelectorAll('script,style,iframe,object,embed,template').forEach(node => node.remove())
      for (const node of content.window.document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre')) {
        if (node.parentElement?.closest('li,blockquote,pre')) continue
        const text = node.textContent.replace(node.tagName === 'PRE' ? /\r/g : /\s+/g, node.tagName === 'PRE' ? '' : ' ').trim().slice(0, remaining)
        if (!text) continue
        blocks.push({ type: /^H\d$/.test(node.tagName) ? 'heading' : node.tagName === 'BLOCKQUOTE' ? 'quote' : node.tagName === 'PRE' ? 'code' : 'paragraph', text })
        remaining -= text.length
        if (remaining <= 0 || blocks.length >= 1000) break
      }
      if (!blocks.length) blocks.push({ type: 'paragraph', text: article.textContent.trim().slice(0, 160000) })
    } finally { content.window.close() }
    const wordCount = blocks.reduce((sum, block) => sum + block.text.split(/\s+/).length, 0)
    return { title: plain(metaTitle || article.title, 500) || title, author: plain(article.byline, 200), siteName: plain(article.siteName, 200) || new URL(url).hostname, excerpt: plain(article.excerpt, 1500) || description, publishedAt: validDate(article.publishedTime), blocks, wordCount, readingMinutes: Math.max(1, Math.ceil(wordCount / 220)), contentStatus: 'ready', fetchError: '' }
  } finally { page.window.close() }
}
async function fetchArticle(input) {
  const url = cleanUrl(input)
  try {
    const response = await download(url)
    return { ...extractArticle(response.text, response.url), fetchedAt: new Date().toISOString() }
  } catch (error) {
    return { blocks: [], contentStatus: 'unavailable', fetchError: String(error.message || 'Could not fetch this article.').slice(0, 500) }
  }
}
module.exports = { cleanUrl, publicAddress, download, parseFeed, discoverFeed, extractArticle, fetchFeed, fetchArticle }
