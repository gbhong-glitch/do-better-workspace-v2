import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: '심플라인 판금 견적',
  description: '판금 부품 DXF 파일 기반 자동 견적',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-base font-semibold tracking-tight">
            심플라인 <span className="text-gray-400 font-normal">판금견적</span>
          </a>
          <nav className="flex items-center gap-4">
            <a href="/viewer" className="text-xs text-gray-500 hover:text-gray-800">도면 뷰어</a>
            <a href="/admin/pricing" className="text-xs text-gray-400 hover:text-gray-600">단가 관리</a>
          </nav>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  )
}
