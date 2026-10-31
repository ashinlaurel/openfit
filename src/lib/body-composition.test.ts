import { describe, expect, it } from 'vitest'
import { createDemoData } from '@/data/demo'
import { bodyComposition } from './body-composition'

describe('body composition', () => {
  it('calculates fat and fat-free mass from readings on the same date', () => {
    const data = createDemoData('2026-10-27')
    Object.assign(data.body, { weightKg: 95, bodyFat: 30, weightDate: '2026-10-27', bodyFatDate: '2026-10-27' })
    expect(bodyComposition(data)).toEqual({ fatMassKg: 28.5, fatFreeMassKg: 66.5, date: '2026-10-27' })
  })
  it('does not combine current weight with an older body-fat reading', () => {
    const data = createDemoData('2026-10-27')
    Object.assign(data.body, { weightKg: 95, bodyFat: 30, weightDate: '2026-10-27', bodyFatDate: '2026-10-26' })
    data.trends[0] = { ...data.trends[0], weight: 95, bodyFat: 30 }
    expect(bodyComposition(data).fatMassKg).toBeNull()
  })
  it('leaves missing or invalid scale estimates unavailable', () => {
    const data = createDemoData('2026-10-27')
    Object.assign(data.body, { weightKg: 95, bodyFat: null, weightDate: '2026-10-27', bodyFatDate: '2026-10-27' })
    expect(bodyComposition(data).fatFreeMassKg).toBeNull()
    data.body.bodyFat = 101
    expect(bodyComposition(data).fatMassKg).toBeNull()
  })
})
