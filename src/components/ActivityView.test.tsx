import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Dialog } from '@/components/ui/dialog'
import { WorkoutDetails } from './ActivityView'
import type { ActivityItem } from '@/types'
// The icon package is browser-bundled; omit decorative icons in these server-rendered assertions.
vi.mock('@/components/icons',()=>({ActivityIcon:()=>null,HeartIcon:()=>null,TrendIcon:()=>null,CloseIcon:()=>null,ChevronDownIcon:()=>null,ChevronUpIcon:()=>null,MinusIcon:()=>null}))
const base:ActivityItem={id:'basic',name:'Workout',date:'2026-06-22',time:'09:00',durationMinutes:30,calories:null,distanceKm:null,averageHeartRate:null,zoneMinutes:null,steps:null,averagePaceSecondsPerMeter:null,heartZoneMinutes:null}
const render=(item:ActivityItem)=>renderToStaticMarkup(<Dialog><WorkoutDetails item={item} samples={[]} source="Google Health"/></Dialog>)
describe('Air workout optional sections',()=>{
  it('omits unavailable metrics and sections for a basic recording',()=>{
    const html=render(base)
    expect(html).toContain('Recorded duration')
    for(const label of ['Workout calories','Workout distance','Average pace','Elevation gain','Running VO₂ max','Pool lengths','Heart rate through the session','Heart-rate zones','Recorded laps &amp; splits','Session events','Workout notes','GPS-associated recording'])expect(html).not.toContain(label)
  })
  it('shows explicit zero metrics without inventing absent swim or running fields',()=>{
    const html=render({...base,calories:0,distanceKm:0,elevationGainMeters:0,heartZoneMinutes:{light:null,moderate:12,vigorous:null,peak:null}})
    expect(html).toContain('0 kcal')
    expect(html).toContain('0.00 km')
    expect(html).toContain('Elevation gain')
    expect(html).toContain('Moderate')
    expect(html).not.toContain('Running VO₂ max')
    expect(html).not.toContain('Pool lengths')
    expect(html).not.toContain('Peak')
  })
  it('shows swimming metrics only for supplied pool details',()=>{
    const html=render({...base,swimLengths:40,poolLengthMeters:25})
    expect(html).toContain('Pool lengths')
    expect(html).toContain('25 m')
    expect(html).not.toContain('Recorded laps &amp; splits')
  })
})
