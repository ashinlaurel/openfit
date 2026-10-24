export const APP_TIME_ZONE = 'Asia/Kolkata'
export function indiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
// Timestamps without an offset are already wall-clock time in India.
export function indiaInstant(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value) ? value + '+05:30' : value)
}
