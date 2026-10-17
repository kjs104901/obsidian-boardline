// Fill in a web link object: the page's title, site icon, description and preview picture,
// fetched by the plugin (Obsidian's requestUrl, linkFetcher.ts) and kept as vault files (so
// boards work offline).

import type { StoredImage } from './assets'
import { hostOf } from './links'
import type { ShapeObject } from './model'
import { createElement } from '@boardline/dom'

export type LinkFields = Pick<ShapeObject, 'link' | 'text' | 'src' | 'preview'>

/**
 * User agent for reading pages: an honest bot name. Sites hand link-preview bots their
 * <meta> tags (some send browsers a script-only page); a few refuse every non-browser.
 */
export const LINK_PREVIEW_AGENT = 'Mozilla/5.0 (compatible; BoardlineBot/0.1; link preview)'

export interface LinkPreview {
  /** Address after redirects. */
  url: string
  title?: string | null
  description?: string | null
  siteName?: string | null
  imageUrl?: string | null
  iconUrl?: string | null
}

/** How a platform reads web pages: their preview data, and images as blobs (null when it can't). */
export interface LinkFetcher {
  preview(url: string): Promise<LinkPreview | null>
  image(url: string): Promise<Blob | null>
}

/** Re-encode a picture as PNG, at most `max` pixels wide (icons may be .ico, previews huge). */
async function toPng(blob: Blob, max: number): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    const k = Math.min(1, max / bitmap.width)
    const canvas = createElement(document, 'canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * k))
    canvas.height = Math.max(1, Math.round(bitmap.height * k))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    return null
  }
}

async function storeFrom(fetcher: LinkFetcher, store: (image: Blob) => Promise<StoredImage>, url: string | null | undefined, max: number): Promise<string | undefined> {
  if (!url) return undefined
  const blob = await fetcher.image(url)
  const png = blob && (await toPng(blob, max))
  if (!png) return undefined
  try {
    return (await store(png)).src
  } catch {
    return undefined
  }
}

/**
 * Everything a link object shows for `url`; `store` keeps the site icon and preview picture.
 * `found` is false when the page couldn't be read (the object then shows the address's host).
 */
export async function webLinkFields(
  fetcher: LinkFetcher,
  store: (image: Blob) => Promise<StoredImage>,
  url: string,
): Promise<{ fields: LinkFields; found: boolean }> {
  const page = await fetcher.preview(url).catch(() => null)
  const [src, image] = await Promise.all([storeFrom(fetcher, store, page?.iconUrl, 64), storeFrom(fetcher, store, page?.imageUrl, 640)])
  const preview = {
    ...(page?.description ? { description: page.description } : {}),
    ...(page?.siteName ? { site: page.siteName } : {}),
    ...(image ? { image } : {}),
  }
  const fields: LinkFields = {
    link: url,
    text: page?.title || hostOf(url),
    ...(src ? { src } : {}),
    ...(Object.keys(preview).length ? { preview } : {}),
  }
  return { fields, found: !!page }
}
