import type { HandoffSummary as Summary, StaffRole } from '../../api/staffChatDetail'

// 인계 요약 5항목(SUM-01) + 담당자(ASSIGN-01). 값이 없으면 지어내지 않고 '없음'만 표시(SUM-02).
// 시각은 데모 tickets 「인계 요약」 카드 그대로 — bg-muted/20 카드, 라벨(작고 옅게)↔값(진하고 굵게) 대비.
// ⭐ '없음' 문구: 규칙 SUM-02는 부재 표시만 요구(정확 문구 미규정) → 정본 데모의 '없음'을 따른다.

const LABELS: [keyof Summary, string][] = [
  ['patientAsked', '환자가 궁금해한 내용'],
  ['botConfirmed', '상담봇이 확인한 정보'],
  ['alreadyGuided', '이미 안내한 내용'],
  ['unresolvedReason', '해결되지 않은 이유'],
  ['staffShouldCheck', '직원이 확인할 사항'],
]
const ROLE: Record<StaffRole, string> = { reception: '접수', doctor: '의사', admin: '관리자' }

export function HandoffSummary({
  summary,
  assignee,
}: {
  summary: Summary
  assignee: { name: string; role: StaffRole } | null
}) {
  return (
    <section aria-label="인계 요약" className="rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">인계 요약</h3>
        {/* ASSIGN-01: in_progress면 담당 직원 이름·역할 */}
        {assignee && (
          <p className="text-xs text-muted-foreground">
            담당: {assignee.name} · {ROLE[assignee.role]}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LABELS.map(([key, label]) => (
          <div key={key}>
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground/80">{label}</dt>
            {/* SUM-02: 지어내지 않음 — 값 없으면 옅은 '없음' */}
            <dd
              className={`mt-0.5 text-sm ${
                summary[key] ? 'font-semibold text-foreground' : 'font-normal text-muted-foreground'
              }`}
            >
              {summary[key] ?? '없음'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
