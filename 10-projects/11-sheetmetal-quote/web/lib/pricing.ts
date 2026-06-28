import { sql } from './db'
import type { PricingData } from './estimate'
import rawDefaults from '../data/pricing_defaults.json'

// JSON의 _meta, _unit, _note 같은 메타 키를 제거하고 숫자 값만 추출
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function omitMeta(obj: Record<string, any>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !k.startsWith('_'))
  )
}

export const PRICING_SEED: PricingData = {
  material_price:        omitMeta(rawDefaults.material_price),
  cut_price_per_m:       omitMeta(rawDefaults.cut_price_per_m),
  pierce_price:          omitMeta(rawDefaults.pierce_price),
  bend_price: {
    P4:      rawDefaults.bend_price.P4,
    general: rawDefaults.bend_price.general,
  },
  special_process_price: omitMeta(rawDefaults.special_process_price),
  surface_price:         omitMeta(rawDefaults.surface_price),
  overhead: {
    management_rate: rawDefaults.overhead.management_rate,
    margin_rate:     rawDefaults.overhead.margin_rate,
  },
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
