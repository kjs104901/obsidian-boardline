// Link previews in Obsidian: pages and images are read with requestUrl (no CORS limits), and
// the page's <head> gives the title, description, icon and preview picture.

import { requestUrl } from 'obsidian'
import { LINK_PREVIEW_AGENT, type LinkFetcher, type LinkPreview } from '@boardline/core/board/linkFetch'

/** Read at most this much of a page; the <head> is near the start. */
const MAX_PAGE = 1024 * 1024
const MAX_IMAGE = 4 * 1024 * 1024

function webUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

function decode(bytes: ArrayBuffer, contentType: string): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096))
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(declared).decode(bytes.slice(0, MAX_PAGE))
  } catch {
    return new TextDecoder('utf-8').decode(bytes.slice(0, MAX_PAGE))
  }
}

export function previewFromHtml(html: string, base: URL): LinkPreview {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const meta = (...keys: string[]) => {
    for (const key of keys) {
      const el = doc.head.querySelector(`meta[property="${key}" i], meta[name="${key}" i]`)
      const content = el?.getAttribute('content')?.trim()
      if (content) return content
    }
    return null
  }
  const abs = (href: string | null | undefined) => {
    if (!href) return null
    try {
      return new URL(href.trim(), base).toString()
    } catch {
      return null
    }
  }
  const icon = [...doc.head.querySelectorAll('link[rel]')].find((l) => {
    const rel = (l.getAttribute('rel') ?? '').toLowerCase()
    return rel.split(/\s+/).includes('icon') || rel === 'apple-touch-icon'
  })
  return {
    url: base.toString(),
    title: meta('og:title', 'twitter:title') ?? (doc.title.trim() || null),
    description: meta('og:description', 'twitter:description', 'description'),
    siteName: meta('og:site_name'),
    imageUrl: abs(meta('og:image', 'og:image:url', 'twitter:image')),
    iconUrl: abs(icon?.getAttribute('href')) ?? abs('/favicon.ico'),
  }
}

export const obsidianLinkFetcher: LinkFetcher = {
  async preview(url) {
    const u = webUrl(url)
    if (!u) return null
    const res = await requestUrl({ url: u.toString(), headers: { 'User-Agent': LINK_PREVIEW_AGENT, Accept: 'text/html,*/*;q=0.5' }, throw: false })
    if (res.status >= 400) return null
    const type = res.headers['content-type'] ?? res.headers['Content-Type'] ?? ''
    if (type && !/html/i.test(type)) return null
    return previewFromHtml(decode(res.arrayBuffer, type), u)
  },
  async image(url) {
    const u = webUrl(url)
    if (!u) return null
    try {
      const res = await requestUrl({ url: u.toString(), throw: false })
      if (res.status >= 400 || res.arrayBuffer.byteLength > MAX_IMAGE) return null
      const type = res.headers['content-type'] ?? res.headers['Content-Type'] ?? 'application/octet-stream'
      return new Blob([res.arrayBuffer], { type: type.split(';')[0] })
    } catch {
      return null
    }
  },
}
