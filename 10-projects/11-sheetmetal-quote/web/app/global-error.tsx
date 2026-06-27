'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">오류가 발생했습니다</h2>
          <p className="text-sm text-gray-500 mb-4">{error.message}</p>
          <button
            onClick={reset}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  )
}
