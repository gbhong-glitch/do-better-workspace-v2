import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400'],
})

export const metadata: Metadata = {
  title: '심플라인 판금 견적',
  description: '판금 부품 DXF 파일 기반 자동 견적',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="h-full flex flex-col bg-background text-on-surface">

        {/* ── TopNavBar ── */}
        <header className="bg-surface border-b border-outline-variant flex items-center justify-between px-gutter h-16 shrink-0 z-50">
          <div className="flex items-center gap-6">
            <a href="/" className="text-lg font-bold text-primary tracking-tight leading-none">
              심플라인{' '}
              <span className="font-normal text-on-surface-variant">판금견적</span>
            </a>
            <nav className="hidden md:flex gap-1">
              <a
                href="/"
                className="text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high px-3 py-2 rounded transition-colors"
              >
                견적
              </a>
              <a
                href="/viewer"
                className="text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high px-3 py-2 rounded transition-colors"
              >
                도면 뷰어
              </a>
              <a
                href="/admin/pricing"
                className="text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high px-3 py-2 rounded transition-colors"
              >
                단가 관리
              </a>
              <a
                href="/p4"
                className="text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high px-3 py-2 rounded transition-colors"
              >
                P4 생성
              </a>
            </nav>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 min-h-0 flex flex-col">{children}</main>

      </body>
    </html>
  )
}
