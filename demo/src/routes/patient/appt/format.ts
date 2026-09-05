const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

function dateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

export function formatDateHeader(date: string) {
  const { year, month, day } = dateParts(date)
  const parsed = new Date(year, month - 1, day)
  if (!Number.isFinite(parsed.getTime())) return date
  return `${month}월 ${day}일 (${WEEKDAYS[parsed.getDay()]})`
}

export function formatTime(time: string) {
  const [hourText, minute] = time.split(':')
  const hour = Number(hourText)
  if (!Number.isFinite(hour) || !minute) return time
  const period = hour < 12 ? '오전' : '오후'
  const displayHour = hour % 12 || 12
  return `${period} ${displayHour}:${minute}`
}

export function formatAppointmentDateTime(date: string, time: string) {
  return `${formatDateHeader(date)} ${formatTime(time)}`
}
