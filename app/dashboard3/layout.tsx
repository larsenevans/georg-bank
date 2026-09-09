import type { Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#F4F6FA',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function Dashboard3Layout({ children }: { children: React.ReactNode }) {
  return children
}
