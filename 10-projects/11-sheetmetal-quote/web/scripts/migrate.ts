/**
 * DB 초기화 스크립트
 * 사용법: DATABASE_URL=... npx tsx scripts/migrate.ts
 */

import { sql, isDbAvailable } from '../lib/db'
import { PRICING_SEED } from '../lib/pricing'

async function migrate() {
  if (!sql || !isDbAvailable) {
    console.error('DATABASE_URL 환경변수가 설정되지 않았습니다.')
    process.exit(1)
  }

  console.log('Migration 시작...')

  await sql`
    CREATE TABLE IF NOT EXISTS pricing_config (
      id      INTEGER PRIMARY KEY DEFAULT 1,
      data    JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  console.log('✓ pricing_config 테이블 생성/확인')

  // 초기 시드 삽입 (이미 존재하면 스킵)
  await sql`
    INSERT INTO pricing_config (id, data)
    VALUES (1, ${JSON.stringify(PRICING_SEED)}::jsonb)
    ON CONFLICT (id) DO NOTHING
  `
  console.log('✓ 초기 단가 시드 삽입 (이미 있으면 스킵)')

  console.log('\n✅ Migration 완료')
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration 실패:', err)
  process.exit(1)
})
