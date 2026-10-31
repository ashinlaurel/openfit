// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseExerciseTcx, projectRoute, routePace } from './exercise-route'
const sample = (time: string, position = '<Position><LatitudeDegrees>12.9</LatitudeDegrees><LongitudeDegrees>77.6</LongitudeDegrees></Position>', distance = '0') => `<Trackpoint><Time>2026-10-26T${time}Z</Time>${position}<DistanceMeters>${distance}</DistanceMeters><AltitudeMeters>0</AltitudeMeters></Trackpoint>`
const tcx = (tracks: string) => `<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity><Lap>${tracks}</Lap></Activity></Activities></TrainingCenterDatabase>`
describe('exercise routes', () => {
  it('parses namespaces, preserves zero altitude and leaves absent coordinates missing', () => {
    const points = parseExerciseTcx(tcx(`<Track>${sample('06:00:00')}${sample('06:00:30', '', '50')}</Track>`))
    expect(points[0]).toMatchObject({ latitude: 12.9, longitude: 77.6, altitude: 0, distance: 0 })
    expect(points[1].latitude).toBeNull()
    expect(routePace(points)).toEqual([null, 600])
    expect(projectRoute(points)[1]).toBeNull()
  })
  it('does not derive pace across track breaks, pauses, resets or duplicate timestamps', () => {
    const points = parseExerciseTcx(tcx(`<Track>${sample('06:00:00')}${sample('06:03:00', '', '100')}${sample('06:03:00', '', '120')}</Track><Track>${sample('06:03:30', '', '150')}${sample('06:04:00', '', '0')}</Track>`))
    expect(routePace(points)).toEqual([null, null, null, null, null])
  })
  it('rejects malformed XML, external entities, invalid coordinates and missing times', () => {
    expect(() => parseExerciseTcx('<TrainingCenterDatabase>')).toThrow()
    expect(() => parseExerciseTcx('<!DOCTYPE x SYSTEM "file:///etc/passwd">')).toThrow()
    const points = parseExerciseTcx(tcx(`<Track>${sample('bad')}${sample('06:00:00', '<Position><LatitudeDegrees>200</LatitudeDegrees></Position>')}</Track>`))
    expect(points).toHaveLength(1)
    expect(points[0].latitude).toBeNull()
  })
  it('unwraps routes that cross the date line', () => {
    const points = parseExerciseTcx(tcx(`<Track>${sample('06:00:00', '<Position><LatitudeDegrees>0</LatitudeDegrees><LongitudeDegrees>179.99</LongitudeDegrees></Position>')}${sample('06:00:30', '<Position><LatitudeDegrees>0</LatitudeDegrees><LongitudeDegrees>-179.99</LongitudeDegrees></Position>')}</Track>`))
    const projected = projectRoute(points)
    expect(Math.abs(projected[1]!.x - projected[0]!.x)).toBeLessThan(.001)
  })
  it('uses a short pace window and excludes near-stationary distance drift', () => {
    const points = parseExerciseTcx(tcx(`<Track>${sample('06:00:00', '', '0')}${sample('06:00:10', '', '20')}${sample('06:00:20', '', '50')}${sample('06:00:30', '', '60')}</Track>`))
    expect(routePace(points)).toEqual([null, 500, 400, 500])
    const stopped = parseExerciseTcx(tcx(`<Track>${sample('06:00:00', '', '0')}${sample('06:00:30', '', '1')}</Track>`))
    expect(routePace(stopped)).toEqual([null, null])
  })
})
