import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// DATABASE_URL 미설정 시 null 반환 → DB 없이도 앱 동작 (단가는 시드값 사용)
function createSql(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return neon(url)
}

export const sql = createSql()
export const isDbAvailable = sql !== null
