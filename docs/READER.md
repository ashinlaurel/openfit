# Reader

Reader is a local desktop utility for saved web articles and RSS/Atom subscriptions. It works independently of the health account.

## Reading workflow

- Save an HTTP(S) article URL. The link is retained even when a publisher blocks extraction.
- Add an RSS/Atom feed URL, or a homepage advertising a feed with an alternate link. Refresh is manual; adding a subscription fetches its first headlines.
- Opening an uncached feed article fetches its readable text. Cached articles open without a network request. Unavailable text can be retried or opened in the system browser.
- Saved, Starred, All articles, History and Archive are separate collections. Archive is reversible. Unsubscribing keeps all imported articles accessible in All articles.
- Search includes titles, authors, sources, tags, excerpts and cached text. Reading progress is debounced and flushed when leaving the article or Reader page. Finishing an article is explicit.
- Reading font, size and dark/sepia theme preferences use localStorage. The library uses native encrypted storage.
- Command palette actions: Reader, Save an article, Subscribe to an RSS feed, Search your reading library, Refresh RSS feeds. Within Reader: N saves, / searches, Escape closes the article.

## Storage

`reader.secure.json` in Electron's app-data directory holds the versioned library: article URLs and metadata, plain text blocks, source feed IDs, bookmarks, stars, tags, reading states and progress, timestamps, and subscriptions with last-successful-fetch dates/errors. The existing OS safeStorage encryption protects this archive and one previous-version `.backup`. Failed/corrupt archives cannot silently overwrite the library. Export writes an explicitly unencrypted JSON copy; backup recovery requires a native confirmation. Health-account disconnect does not remove Reader data.

The implementation currently limits the library to 50 subscriptions, 5,000 articles and 30 MB of serialized data. Each refresh imports up to 100 entries per feed and deduplicates by normalized URL (fragments removed). Saved state, cached content and progress survive feed refreshes. Extraction retains up to 160,000 characters / 1,000 text blocks per article. Images, scripts, styles and embeds are omitted. Word-based reading times use 220 words/minute as a display estimate.

## Boundaries

`reader-service.cjs` downloads and parses public content in the main process. It rejects non-HTTP(S), private/local hosts, credentials, nonstandard ports, private DNS answers and unsafe redirect targets. DNS results are pinned to each request. Each request has a timeout, four-redirect limit and 3 MB download limit. XML DTD/entity declarations are rejected. JSDOM runs without scripts or resource loading. Mozilla Readability extracts text, and the renderer displays React text nodes rather than publisher HTML. No page cookies, credentials, health data or AI requests are sent to publishers.

`reader-store.cjs` validates archives and applies library mutations. Named trusted-origin IPC handlers serialize network operations and writes to prevent lost updates. The renderer cannot invoke internal cache/feed-ingestion actions or arbitrary network/filesystem access.

Tests cover RSS/Atom parsing and discovery, malicious entry URLs and XML, text extraction, public network validation and DNS pinning, private redirect rejection, size limits, deduplication, history retention, invalid mutations and preload contracts. Public Hacker News and Mozilla Hacks feeds are also checked manually during development without writing them into the library.
