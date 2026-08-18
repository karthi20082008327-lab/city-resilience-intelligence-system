interface CrisLogoProps {
  className?: string
}

export function CrisLogo({ className = 'w-9 h-9' }: CrisLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} flex-shrink-0`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cris-tile" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      <rect x="3" y="3" width="58" height="58" rx="15" fill="url(#cris-tile)" />

      {/* shield outline */}
      <path
        d="M32 10.5 49 15.5v13.4c0 11.5-7.2 21.8-17 26.2-9.8-4.4-17-14.7-17-26.2V15.5L32 10.5Z"
        fill="rgba(255,255,255,0.10)"
        stroke="#ffffff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />

      {/* radar / signal pulse (intelligence & risk detection) */}
      <circle cx="32" cy="27" r="2.6" fill="#ffffff" />
      <circle cx="32" cy="27" r="5.6" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="1.3" />
      <circle cx="32" cy="27" r="8.8" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.3" />

      {/* cascading waves (cascading disasters / water) */}
      <path
        d="M17 38c3.75 0 3.75-3.75 7.5-3.75s3.75 3.75 7.5 3.75 3.75-3.75 7.5-3.75 3.75 3.75 7.5 3.75"
        stroke="#ffffff"
        strokeOpacity="0.95"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 44c3.75 0 3.75-3.75 7.5-3.75s3.75 3.75 7.5 3.75 3.75-3.75 7.5-3.75 3.75 3.75 7.5 3.75"
        stroke="#ffffff"
        strokeOpacity="0.65"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 50c3.75 0 3.75-3.75 7.5-3.75s3.75 3.75 7.5 3.75 3.75-3.75 7.5-3.75 3.75 3.75 7.5 3.75"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
