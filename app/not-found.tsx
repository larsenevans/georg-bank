import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '404 Not Found',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#fff',
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 16px 0' }}>404 Not Found</h1>
      <hr style={{ width: '400px', borderColor: '#eaeaea', margin: '0 0 16px 0' }} />
      <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>nginx</p>
    </div>
  )
}
