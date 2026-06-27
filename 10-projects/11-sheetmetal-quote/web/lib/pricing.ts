import { sql } from './db'
import type { PricingData } from './estimate'

// 초기 시드 — 실제 단가는 /admin/pricing에서 입력
export const PRICING_SEED: PricingData = {
  material_price: {
    SPCC: 0, SECC: 0, SGCC: 0, SS400: 0,
    SUS304: 0, SUS316: 0, AL5052: 0, AL6061: 0,
  },
  cut_price_per_m: {
    '0.8': 0, '1.0': 0, '1.2': 0, '1.5': 0, '2.0': 0,
    '2.3': 0, '3.0': 0, '4.0': 0, '5.0': 0, '6.0': 0,
  },
  pierce_price: {
    '0.8': 0, '1.0': 0, '1.2': 0, '1.5': 0, '2.0': 0,
    '2.3': 0, '3.0': 0, '4.0': 0, '5.0': 0, '6.0': 0,
  },
  bend_price: {
    P4:      { setup: 0, per_m: 0 },
    general: { setup: 0, per_m: 0 },
  },
  special_process_price: {
    TAP_M3: 0, TAP_M4: 0, TAP_M5: 0, TAP_M6: 0, TAP_M8: 0, BUR: 0, EM: 0,
  },
  surface_price: { '분체도장': 0, '도장': 0, '도금': 0, '없음': 0 },
  overhead: { management_rate: 0, margin_rate: 0 },
}

export async function getPricing(): Promise<PricingData> {
  if (sql) {
    try {
      const rows = await sql`SELECT data FROM pricing_config ORDER BY updated_at DESC LIMIT 1`
      if (rows.length > 0) return rows[0].data as PricingData
    } catch {
      // DB 미연결 시 시드값 폴백
    }
  }
  return PRICING_SEED
}

export async function savePricing(data: PricingData): Promise<void> {
  if (!sql) throw new Error('DATABASE_URL이 설정되지 않았습니다.')
  await sql`
    INSERT INTO pricing_config (id, data, updated_at)
    VALUES (1, ${JSON.stringify(data)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE
    SET data = EXCLUDED.data, updated_at = NOW()
  `
}
