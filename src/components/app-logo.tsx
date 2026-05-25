import { useId, type CSSProperties } from "react"

/**
 * AppLogo — inline UsageLeft logo with unique SVG ids so gradients never collide.
 */
export function AppLogo({ className, style }: { className?: string; style?: CSSProperties }) {
  const idPrefix = useId().replace(/:/g, "")
  const bgId = `${idPrefix}-logo-bg`
  const progressId = `${idPrefix}-logo-progress`
  const innerRingId = `${idPrefix}-logo-inner-ring`
  const softGlowId = `${idPrefix}-logo-soft-glow`
  const dotGlowId = `${idPrefix}-logo-dot-glow`

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ borderRadius: "22%", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={bgId} cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#15102A" />
          <stop offset="55%" stopColor="#080716" />
          <stop offset="100%" stopColor="#02030A" />
        </radialGradient>
        <linearGradient id={progressId} x1="280" y1="210" x2="760" y2="820" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6D4BFF" />
          <stop offset="42%" stopColor="#8E4DFF" />
          <stop offset="72%" stopColor="#C03BFF" />
          <stop offset="100%" stopColor="#F05CFF" />
        </linearGradient>
        <linearGradient id={innerRingId} x1="320" y1="260" x2="700" y2="760" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7B4DFF" />
          <stop offset="100%" stopColor="#D44DFF" />
        </linearGradient>
        <filter id={softGlowId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.58  0 0 0 0 0.16  0 0 0 0 1  0 0 0 0.85 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={dotGlowId} x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="16" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.75  0 0 0 0 0.2  0 0 0 0 1  0 0 0 1 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="1024" height="1024" rx="0" fill={`url(#${bgId})`} />
      <circle cx="512" cy="512" r="292" stroke="#5D32C8" strokeOpacity="0.26" strokeWidth="10" />
      <circle
        cx="512"
        cy="512"
        r="210"
        stroke={`url(#${innerRingId})`}
        strokeWidth="6"
        strokeOpacity="0.95"
        filter={`url(#${softGlowId})`}
      />
      <path
        d="M 512 220 A 292 292 0 1 1 305.525 718.475"
        stroke={`url(#${progressId})`}
        strokeWidth="56"
        strokeLinecap="round"
        filter={`url(#${softGlowId})`}
      />
      <circle cx="305.525" cy="718.475" r="28" fill="#D65BFF" filter={`url(#${dotGlowId})`} />
      <circle cx="305.525" cy="718.475" r="19" fill="#F0B8FF" fillOpacity="0.85" />
    </svg>
  )
}
