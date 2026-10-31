export interface RoutePoint {
  time: string
  latitude: number | null
  longitude: number | null
  altitude: number | null
  distance: number | null
  segment: number
}
const child = (node: Element, tag: string) => node.getElementsByTagNameNS('*', tag)[0]?.textContent?.trim() ?? ''
const number = (text: string) => text !== '' && Number.isFinite(Number(text)) ? Number(text) : null

export function parseExerciseTcx(tcx: string): RoutePoint[] {
  if (tcx.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(tcx)) throw new Error('Invalid route file.')
  const xml = new DOMParser().parseFromString(tcx, 'application/xml')
  if (xml.getElementsByTagName('parsererror').length || xml.documentElement.localName !== 'TrainingCenterDatabase') throw new Error('Invalid route file.')
  const points: RoutePoint[] = []
  Array.from(xml.getElementsByTagNameNS('*', 'Track')).forEach((track, segment) => {
    for (const node of Array.from(track.getElementsByTagNameNS('*', 'Trackpoint'))) {
      const time = child(node, 'Time')
      if (!Number.isFinite(Date.parse(time))) continue
      const latitude = number(child(node, 'LatitudeDegrees')), longitude = number(child(node, 'LongitudeDegrees'))
      points.push({ time, segment, latitude: latitude !== null && Math.abs(latitude) <= 90 ? latitude : null,
        longitude: longitude !== null && Math.abs(longitude) <= 180 ? longitude : null,
        altitude: number(child(node, 'AltitudeMeters')), distance: number(child(node, 'DistanceMeters')) })
      if (points.length > 100_000) throw new Error('This route has too many samples.')
    }
  })
  return points
}

export function routePace(points: RoutePoint[]) {
  return points.map((point, index) => {
    let start = index - 1
    while (start > 0 && index - start < 1000 && points[start - 1].segment === point.segment && points[start - 1].distance !== null && points[start].distance !== null && points[start - 1].distance! <= points[start].distance! && Date.parse(points[start].time) - Date.parse(points[start - 1].time) <= 120_000 && Date.parse(point.time) - Date.parse(points[start].time) < 30_000) start--
    const previous = points[start]
    if (!previous || point.segment !== previous.segment || point.distance === null || previous.distance === null) return null
    const seconds = (Date.parse(point.time) - Date.parse(previous.time)) / 1000
    const meters = point.distance - previous.distance
    // Near-stationary GPS drift produces arbitrarily large pace values.
    return seconds > 0 && seconds <= 120 && meters / seconds >= .3 ? seconds / meters * 1000 : null
  })
}

export function projectRoute(points: RoutePoint[]) {
  let previousX: number | null = null
  return points.map(point => {
    if (point.latitude === null || point.longitude === null) return null
    let x = (point.longitude + 180) / 360
    if (previousX !== null) x += Math.round(previousX - x)
    previousX = x
    const sin = Math.sin(Math.max(-85.0511, Math.min(85.0511, point.latitude)) * Math.PI / 180)
    return { ...point, x, y: .5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) }
  })
}
