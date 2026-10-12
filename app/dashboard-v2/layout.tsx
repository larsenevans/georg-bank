import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  themeColor: '#0d0201',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'George | Horizon Dashboard',
  icons: {
    icon: [
      { url: '/favicon-horizon-fire.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon-horizon-fire.svg',
    apple: '/favicon-horizon-fire.svg',
  },
}

export default function HorizonLayout({ children }: { children: React.ReactNode }) {
  return children
}
