import { Image } from "@tauri-apps/api/image"
import type { MenubarIconStyle } from "@/lib/settings"
import type { TrayPrimaryBar } from "@/lib/tray-primary-progress"

const PROVIDER_ICON_SHRINK_PX = 1
const PROVIDER_ICON_VERTICAL_NUDGE_PX = 0
const BARS_TRACK_OPACITY = 0.16
const BARS_REMAINDER_OPACITY = 0.24
const BARS_FILL_OPACITY = 1

function rgbaToImageDataBytes(rgba: Uint8ClampedArray): Uint8Array {
  // Image.new expects Uint8Array. Uint8ClampedArray shares the same buffer layout.
  return new Uint8Array(rgba.buffer)
}

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}



function getMinVisibleRemainderPx(trackW: number): number {
  // Keep remainder clearly visible after tray downsampling.
  return Math.max(4, Math.round(trackW * 0.2))
}

function getVisualBarFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0
  const clamped = Math.max(0, Math.min(1, fraction))
  if (clamped > 0.7 && clamped < 1) {
    // Quantize high-end bars by remainder in 15% steps so near-full values
    // still leave a meaningful visible tail.
    const remainder = 1 - clamped
    const quantizedRemainder = Math.min(1, Math.ceil(remainder / 0.15) * 0.15)
    return Math.max(0, 1 - quantizedRemainder)
  }
  return clamped
}

export function getBarFillLayout(trackW: number, fraction: number): {
  fillW: number
  remainderDrawW: number
  dividerX: number | null
} {
  if (!Number.isFinite(fraction) || fraction <= 0) {
    return { fillW: 0, remainderDrawW: 0, dividerX: null }
  }

  const visual = getVisualBarFraction(fraction)
  if (visual >= 1) {
    return { fillW: trackW, remainderDrawW: 0, dividerX: null }
  }

  const minVisibleRemainderPx = getMinVisibleRemainderPx(trackW)
  const maxFillW = Math.max(1, trackW - minVisibleRemainderPx)
  const fillW = Math.max(1, Math.min(maxFillW, Math.round(trackW * visual)))
  const trueRemainderW = trackW - fillW
  const remainderDrawW = Math.min(trackW - 1, Math.max(trueRemainderW, minVisibleRemainderPx))
  const dividerX = trackW - remainderDrawW
  return { fillW, remainderDrawW, dividerX }
}

function normalizePercentText(percentText: string | undefined): string | undefined {
  if (typeof percentText !== "string") return undefined
  const trimmed = percentText.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function estimateTextWidthPx(text: string, fontSize: number): number {
  // Empirical estimate for SF Pro bold numeric glyphs in tray-sized icons.
  return Math.ceil(text.length * fontSize * 0.62 + fontSize * 0.2)
}

function shortAgentLabel(bar: TrayPrimaryBar | undefined): string {
  const label = (bar?.label ?? bar?.id ?? "").trim()
  if (!label) return "O"
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    return words
      .map((word) => word[0]?.toUpperCase())
      .join("")
      .slice(0, 2)
  }
  return label.slice(0, 2).toUpperCase()
}

function renderMaskedIcon(args: {
  id: string
  href: string
  x: number
  y: number
  size: number
  fill: string
}): string {
  const { id, href, x, y, size, fill } = args
  return [
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">`,
    `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${escapeXmlText(href)}" preserveAspectRatio="xMidYMid meet" />`,
    "</mask>",
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" mask="url(#${id})" />`,
  ].join("")
}

function getSvgLayout(args: {
  sizePx: number
  style: MenubarIconStyle
  percentText?: string
  barCount?: number
}): {
  width: number
  height: number
  pad: number
  gap: number
  barsX: number
  barsWidth: number
  textX: number
  textY: number
  fontSize: number
} {
  const { sizePx, style, percentText, barCount = 1 } = args
  const hasPercentText = typeof percentText === "string" && percentText.length > 0
  const verticalNudgePx = 1
  const pad = Math.max(1, Math.round(sizePx * 0.08)) // ~2px at 24–36px
  const gap = Math.max(1, Math.round(sizePx * 0.03)) // ~1px at 36px

  const height = sizePx
  const barsX = pad
  const barsWidth = sizePx - 2 * pad
  const fontSize = Math.max(9, Math.round(sizePx * 0.72))
  const textWidth = hasPercentText ? estimateTextWidthPx(percentText, fontSize) : 0
  // Optical correction + global nudge down to align with the tray slot center.
  const textY = Math.round(sizePx / 2) + 1 + verticalNudgePx

  if (style === "text") {
    return {
      width: hasPercentText ? textWidth + pad * 2 : 1,
      height,
      pad,
      gap,
      barsX: pad,
      barsWidth: 0,
      textX: pad,
      textY,
      fontSize,
    }
  }

  if (style === "agents") {
    const n = Math.max(1, Math.min(6, barCount))
    const segmentW = Math.max(20, Math.round(sizePx * 1.28))
    return {
      width: n * segmentW + (n - 1) * gap + pad * 2,
      height,
      pad,
      gap,
      barsX: pad,
      barsWidth: segmentW,
      textX: 0,
      textY,
      fontSize: Math.max(8, Math.round(sizePx * 0.42)),
    }
  }

  if (style === "donut") {
    const donutGap = Math.max(1, Math.round(sizePx * 0.06))
    return {
      width: sizePx + donutGap + sizePx,
      height,
      pad,
      gap,
      barsX,
      barsWidth,
      textX: 0,
      textY,
      fontSize,
    }
  }

  if (!hasPercentText) {
    return {
      width: sizePx,
      height,
      pad,
      gap,
      barsX,
      barsWidth,
      textX: 0,
      textY,
      fontSize,
    }
  }

  const textGap = Math.max(2, Math.round(sizePx * 0.08))
  const textAreaWidth = Math.max(20, Math.round(sizePx * 1.5), textWidth + pad)
  const rightPad = pad

  return {
    width: sizePx + textGap + textAreaWidth + rightPad,
    height,
    pad,
    gap,
    barsX,
    barsWidth,
    textX: sizePx + textGap,
    textY,
    fontSize,
  }
}

export function makeTrayBarsSvg(args: {
  bars: TrayPrimaryBar[]
  sizePx: number
  style: MenubarIconStyle
  percentText: string
  textSegments?: { text: string; color: string }[]
  providerIconUrl?: string
  providerIconUrls?: string[]
  foregroundColor?: string
}): string {
  const { bars, sizePx, style, percentText: rawPercentText, textSegments, providerIconUrl, providerIconUrls, foregroundColor = "#ffffff" } = args
  const barsForStyle = style === "agents" ? bars : bars.slice(0, 1)
  const icons = providerIconUrls || (providerIconUrl ? [providerIconUrl] : [])
  // Intentionally render a single empty track when bars mode has no data yet
  // so the tray icon keeps a stable shape during loading/initialization.
  const maxBars = style === "agents" ? 6 : 4
  const n = Math.max(1, Math.min(maxBars, barsForStyle.length || 1))
  const text = normalizePercentText(rawPercentText)
  const layout = getSvgLayout({
    sizePx,
    style,
    percentText: text,
    barCount: n,
  })

  const width = layout.width
  const height = layout.height

  const parts: string[] = []
  parts.push(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  )

  if (style === "provider") {
    const hasText = typeof text === "string" && text.length > 0
    const iconSize = Math.max(6, Math.round(sizePx - 2 * layout.pad * 0.5) - (hasText ? PROVIDER_ICON_SHRINK_PX : 0))
    const x = layout.barsX
    const y = Math.round((height - iconSize) / 2) + (hasText ? PROVIDER_ICON_VERTICAL_NUDGE_PX : 0)
    const href = typeof icons[0] === "string" ? icons[0].trim() : ""

    if (href.length > 0) {
      parts.push(
        renderMaskedIcon({ id: "provider-mask", href, x, y, size: iconSize, fill: foregroundColor })
      )
    } else {
      const cx = x + iconSize / 2
      const cy = y + iconSize / 2
      const radius = Math.max(2, iconSize / 2 - 1.5)
      const strokeW = Math.max(1.5, Math.round(iconSize * 0.14))
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${foregroundColor}" stroke-width="${strokeW}" opacity="1" shape-rendering="geometricPrecision" />`
      )
    }
  } else if (style === "donut") {
    const iconSize = Math.max(6, Math.round(sizePx - 2 * layout.pad * 0.5))
    const iconX = layout.barsX
    const iconY = Math.round((height - iconSize) / 2)
    const href = typeof icons[0] === "string" ? icons[0].trim() : ""

    if (href.length > 0) {
      parts.push(
        renderMaskedIcon({ id: "donut-provider-mask", href, x: iconX, y: iconY, size: iconSize, fill: foregroundColor })
      )
    } else {
      const label = shortAgentLabel(barsForStyle[0])
      parts.push(
        `<text x="${iconX + iconSize / 2}" y="${iconY + iconSize / 2 + 1}" fill="${foregroundColor}" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" font-size="${Math.max(6, Math.round(iconSize * 0.55))}" font-weight="800" text-anchor="middle" dominant-baseline="middle">${escapeXmlText(label)}</text>`
      )
    }

    const donutGap = Math.max(1, Math.round(sizePx * 0.06))
    const donutAreaX = sizePx + donutGap
    const chartSize = Math.max(6, sizePx - 2 * layout.pad)
    const cx = donutAreaX + layout.pad + chartSize / 2
    const cy = height / 2 + 1
    const strokeW = Math.max(2, Math.round(chartSize * 0.16))
    const radius = Math.max(1, Math.floor(chartSize / 2 - strokeW / 2) + 0.5)

    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${foregroundColor}" stroke-width="${strokeW}" opacity="${BARS_TRACK_OPACITY}" shape-rendering="geometricPrecision" />`
    )

    const fraction = barsForStyle[0]?.fraction
    if (typeof fraction === "number" && Number.isFinite(fraction) && fraction >= 0) {
      const clamped = Math.max(0, Math.min(1, fraction))
      if (clamped > 0) {
        const circumference = 2 * Math.PI * radius
        const dash = circumference * clamped
        parts.push(
          `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${foregroundColor}" stroke-width="${strokeW}" stroke-linecap="butt" stroke-dasharray="${dash} ${circumference}" transform="rotate(-90 ${cx} ${cy})" opacity="${BARS_FILL_OPACITY}" shape-rendering="geometricPrecision" />`
        )
      }
    }
  } else if (style === "agents") {
    const segmentW = layout.barsWidth
    const labelY = Math.max(7, Math.round(height * 0.4))
    const trackH = Math.max(2, Math.round(height * 0.16))
    const trackY = Math.round(height * 0.68)
    const rx = Math.max(1, Math.floor(trackH / 2))

    for (let i = 0; i < n; i += 1) {
      const bar = barsForStyle[i]
      const x = layout.pad + i * (segmentW + layout.gap)
      const label = shortAgentLabel(bar)
      const href = icons[i]?.trim()
      if (href && href.length > 0) {
        const iconSize = Math.max(6, Math.round(height * 0.45))
        const iconY = Math.round((trackY - iconSize) / 2)
        const iconX = x + (segmentW - iconSize) / 2
        parts.push(
          renderMaskedIcon({ id: `agent-mask-${i}`, href, x: iconX, y: iconY, size: iconSize, fill: foregroundColor })
        )
      } else {
        parts.push(
          `<text x="${x + segmentW / 2}" y="${labelY}" fill="${foregroundColor}" font-family="Inter,Arial,sans-serif" font-size="${layout.fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle">${escapeXmlText(label)}</text>`
        )
      }
      parts.push(
        `<rect x="${x}" y="${trackY}" width="${segmentW}" height="${trackH}" rx="${rx}" fill="${foregroundColor}" opacity="${BARS_TRACK_OPACITY}" />`
      )

      const fraction = bar?.fraction
      if (typeof fraction === "number" && Number.isFinite(fraction) && fraction >= 0) {
        const { fillW, remainderDrawW, dividerX } = getBarFillLayout(segmentW, fraction)
        if (fillW > 0) {
          parts.push(
            `<rect x="${x}" y="${trackY}" width="${fillW}" height="${trackH}" rx="${rx}" fill="${foregroundColor}" opacity="${BARS_FILL_OPACITY}" />`
          )
        }
        if (fillW > 0 && remainderDrawW > 0 && dividerX !== null) {
          parts.push(
            `<rect x="${x + dividerX}" y="${trackY}" width="${remainderDrawW}" height="${trackH}" rx="${rx}" fill="${foregroundColor}" opacity="${BARS_REMAINDER_OPACITY}" />`
          )
        }
      }
    }
  }

  if (textSegments && textSegments.length > 0) {
    // We roughly estimate text width to lay out multiple tspans.
    // However, SVG 1.1 supports <tspan> sequentially!
    // But since we can just construct multiple text elements or tspans, we can use <text> with <tspan>
    const tspans = textSegments.map(seg => `<tspan fill="${seg.color}">${escapeXmlText(seg.text)}</tspan>`).join(" ")
    parts.push(
      `<text x="${layout.textX}" y="${layout.textY}" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" font-size="${layout.fontSize}" font-weight="700" dominant-baseline="middle">${tspans}</text>`
    )
  } else if (text) {
    parts.push(
      `<text x="${layout.textX}" y="${layout.textY}" fill="${foregroundColor}" font-family="-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" font-size="${layout.fontSize}" font-weight="700" dominant-baseline="middle">${escapeXmlText(text)}</text>`
    )
  }

  parts.push(`</svg>`)
  return parts.join("")
}

async function rasterizeSvgToRgba(svg: string, widthPx: number, heightPx: number): Promise<Uint8Array> {
  const blob = new Blob([svg], { type: "image/svg+xml" })
  const url = URL.createObjectURL(blob)
  try {
    const img = new window.Image()
    img.decoding = "async"

    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Failed to load SVG into image"))
    })

    img.src = url
    await loaded

    const canvas = document.createElement("canvas")
    canvas.width = widthPx
    canvas.height = heightPx

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D context missing")

    // Clear to transparent; template icons use alpha as mask.
    ctx.clearRect(0, 0, widthPx, heightPx)
    ctx.drawImage(img, 0, 0, widthPx, heightPx)

    const imageData = ctx.getImageData(0, 0, widthPx, heightPx)
    return rgbaToImageDataBytes(imageData.data)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function renderTrayBarsIcon(args: {
  bars: TrayPrimaryBar[]
  sizePx: number
  style?: MenubarIconStyle
  percentText?: string
  textSegments?: { text: string; color: string }[]
  providerIconUrl?: string
  providerIconUrls?: string[]
  foregroundColor?: string
}): Promise<Image> {
  const { bars, sizePx, style = "provider", percentText, textSegments, providerIconUrl, providerIconUrls, foregroundColor } = args
  const text = normalizePercentText(percentText)
  const svg = makeTrayBarsSvg({
    bars,
    sizePx,
    style,
    percentText: text || "",
    textSegments,
    providerIconUrl,
    providerIconUrls,
    foregroundColor,
  })
  const layout = getSvgLayout({
    sizePx,
    style,
    percentText: text,
    barCount: style === "agents" ? Math.max(1, Math.min(6, bars.length || 1)) : undefined,
  })
  const rgba = await rasterizeSvgToRgba(svg, layout.width, layout.height)
  return await Image.new(rgba, layout.width, layout.height)
}

export function getTrayIconSizePx(devicePixelRatio: number | undefined): number {
  const dpr = typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1
  // 18pt-ish slot -> render at 18px * dpr for crispness (36px on Retina).
  return Math.max(18, Math.round(18 * dpr))
}
