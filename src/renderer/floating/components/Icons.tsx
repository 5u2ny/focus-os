import React from 'react'

interface IconProps {
  size?: number
  style?: React.CSSProperties
  className?: string
}

const icon = (path: string) =>
  ({ size = 16, style, className }: IconProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round"
      strokeLinejoin="round" style={style} className={className}>
      {path.split('|').map((d, i) => <path key={i} d={d} />)}
    </svg>
  )

export const IconMegaphone    = icon('M3 11l19-9-9 19-2-8-8-2z')
export const IconClock        = icon('M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z|M12 6v6l4 2')
export const IconBarChart     = icon('M18 20V10|M12 20V4|M6 20v-6')
export const IconFileText     = icon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8')
export const IconGraduationCap = icon('M22 10v6M2 10l10-5 10 5-10 5z|M6 12v5c3 3 9 3 12 0v-5')
export const IconArrowUpRight = icon('M7 17L17 7|M7 7h10v10')
export const IconX            = icon('M18 6L6 18|M6 6l12 12')
export const IconCheck        = icon('M20 6L9 17l-5-5')
export const IconPlus         = icon('M12 5v14|M5 12h14')
export const IconTrash        = icon('M3 6h18|M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2')
export const IconEdit         = icon('M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z')
export const IconRefresh      = icon('M23 4v6h-6|M20.49 15a9 9 0 1 1-2.12-9.36L23 10')
