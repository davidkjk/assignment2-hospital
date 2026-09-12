// 시각 표기 — 데모와 같은 `YYYY-MM-DD HH:mm`(Asia/Seoul). ISO 원문을 화면에 그대로 내보내지 않는다.
const fmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatKst(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso // 계약 밖 값은 지어내지 않고 그대로 보인다
  return fmt.format(d).replace(',', '')
}
