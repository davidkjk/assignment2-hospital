import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  History,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from '@/components/icons'
import { EmptyState, PageHead, StaffPage, Tag, btnGhost } from '../../_ui'
import { maskBirth, maskPhone } from '../../mockData'

// 중복 환자 후보 (/staff/admin/patient-merge-candidates) — MERGE-*.
// 관리자 전용. 자동 병합 안 함(MERGE-HEAD-02). 3단계: 목록 → 좌우 비교 → 확인창(읽음 체크 후에만 확정).
// 되돌릴 수 없음 · 정정은 병합 이력 화면(MERGE-UNDO-01·02). 이중 계정은 잠금(MERGE-STATE-04).
// data-testid="staff-merge-candidates".

interface Person {
  id: string
  name: string
  birth: string
  phone: string
  linked: boolean // 계정 연결 여부 (MERGE-LIST-03)
  appts: number
  qnr: number
  records: number
  audits: number
  lastVisit: string // '' → 방문 없음
}

interface Candidate {
  id: string
  left: Person
  right: Person
}

// 후보 3그룹: 정상 1 / 한쪽 계정연결 1 / 이중 계정(잠금) 1 (품질기준 #3 다양성)
const CANDIDATES: Candidate[] = [
  {
    id: 'c1',
    left: { id: 'a1', name: '이수현', birth: '1982-05-11', phone: '010-4471-2290', linked: true, appts: 12, qnr: 9, records: 8, audits: 21, lastVisit: '2026-08-14' },
    right: { id: 'a2', name: '이수현', birth: '1982-05-11', phone: '010-4471-2290', linked: false, appts: 3, qnr: 1, records: 2, audits: 4, lastVisit: '2026-06-02' },
  },
  {
    id: 'c2',
    left: { id: 'b1', name: '박서준', birth: '1965-07-21', phone: '010-3390-7742', linked: false, appts: 6, qnr: 5, records: 6, audits: 10, lastVisit: '2026-08-10' },
    right: { id: 'b2', name: '박서준', birth: '1965-07-21', phone: '010-3390-7742', linked: false, appts: 2, qnr: 0, records: 1, audits: 3, lastVisit: '' },
  },
  {
    id: 'c3',
    left: { id: 'd1', name: '최유나', birth: '2001-09-30', phone: '010-5567-2098', linked: true, appts: 4, qnr: 3, records: 3, audits: 7, lastVisit: '2026-08-18' },
    right: { id: 'd2', name: '최유나', birth: '2001-09-30', phone: '010-5567-2098', linked: true, appts: 1, qnr: 1, records: 0, audits: 2, lastVisit: '2026-07-22' },
  },
]

const bothLinked = (c: Candidate) => c.left.linked && c.right.linked

export function MergeCandidates() {
  const [selected, setSelected] = useState<Candidate | null>(null)
  const [rep, setRep] = useState<'left' | 'right' | null>(null) // 대표 (MERGE-REVIEW-01)
  const [confirming, setConfirming] = useState(false) // 확인창 (MERGE-CONFIRM-01)
  const [read, setRead] = useState(false) // 읽음 체크 (MERGE-CONFIRM-04)
  const [merged, setMerged] = useState<Candidate[]>([])

  const list = CANDIDATES.filter((c) => !merged.some((m) => m.id === c.id))

  function openCompare(c: Candidate) {
    setSelected(c)
    setRep(null) // 자동 선택 안 함 — MERGE-COMPARE-03은 '권고'만, 대표는 사용자가 고른다

    setConfirming(false)
    setRead(false)
  }
  function backToList() {
    setSelected(null)
    setRep(null)
    setConfirming(false)
    setRead(false)
  }
  function doMerge() {
    if (selected) setMerged((m) => [...m, selected])
    backToList()
  }

  return (
    <StaffPage testid="staff-merge-candidates" max="max-w-[1200px]">
      <PageHead
        title="중복 환자 후보"
        sub="같은 사람의 환자 기록이 나뉘었는지 확인하고 병합을 검토합니다"
      />

      {/* 자동 병합 고지 — MERGE-HEAD-02 */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm">
          <div className="font-semibold text-amber-900">자동으로 합치지 않습니다</div>
          <div className="mt-0.5 text-amber-800/90">
            두 기록을 직접 비교하고 대표를 정한 뒤에만 검토를 시작합니다. 가족이 같은 번호를 쓰면 실제로 다른 사람일 수 있습니다.
          </div>
        </div>
      </div>

      {!selected ? (
        list.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6" />}
              title="현재 병합을 검토할 중복 환자가 없습니다"
              hint="새 후보가 생기면 이곳에 표시됩니다"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((c) => (
              <CandidateCard key={c.id} candidate={c} onReview={() => openCompare(c)} />
            ))}
          </div>
        )
      ) : (
        <Compare
          candidate={selected}
          rep={rep}
          onRep={setRep}
          onBack={backToList}
          onReview={() => setConfirming(true)}
        />
      )}

      {confirming && selected && rep && (
        <ConfirmDialog
          candidate={selected}
          rep={rep}
          read={read}
          onRead={setRead}
          onCancel={() => setConfirming(false)}
          onConfirm={doMerge}
        />
      )}
    </StaffPage>
  )
}

// ── 후보 카드 (목록) — MERGE-LIST-01·03·04·05 ──
function CandidateCard({ candidate, onReview }: { candidate: Candidate; onReview: () => void }) {
  const locked = bothLinked(candidate)
  const { left, right } = candidate
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">{left.name}</h3>
          <Tag>{maskBirth(left.birth)}</Tag>
          <Tag>{maskPhone(left.phone)}</Tag>
        </div>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5" /> 검토 잠금
          </span>
        ) : (
          <button onClick={onReview} className={btnGhost}>
            <Eye className="h-4 w-4" /> 대표로 검토
          </button>
        )}
      </div>

      {/* 두 활성 행 요약 (MERGE-LIST-03) */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        {[left, right].map((p, i) => (
          <div key={p.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{i === 0 ? '기록 A' : '기록 B'}</span>
              {p.linked ? <Tag className="!bg-primary/10 !text-primary">계정 연결</Tag> : <Tag>계정 미연결</Tag>}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="tabular-nums text-muted-foreground">진료기록 {p.records}건 · 예약 {p.appts}건</span>
              <span className="tabular-nums text-xs text-muted-foreground">{p.lastVisit ? `${p.lastVisit} 방문` : '방문 없음'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 근거 문구 (MERGE-LIST-04) / 이중 계정 잠금 (MERGE-STATE-04) */}
      {locked ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>두 기록 모두 계정이 연결되어 있어 자동 병합할 수 없습니다. 가족 연결과 혼동하지 말고 환자 상세에서 별도 확인하세요.</span>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          같은 값으로 묶인 후보입니다. 가족이 번호를 공유하면 실제로 다른 사람일 수 있습니다.
        </p>
      )}
    </section>
  )
}

// ── 좌우 비교 (2단계) — MERGE-COMPARE-* ──
const METRICS: { key: keyof Person; label: string; Icon: typeof FileText }[] = [
  { key: 'appts', label: '예약 건수', Icon: CalendarDays },
  { key: 'qnr', label: '문진 작성 예약', Icon: ClipboardList },
  { key: 'records', label: '진료기록 건수', Icon: FileText },
  { key: 'audits', label: '감사 기록 건수', Icon: ShieldCheck },
]

function Compare({
  candidate,
  rep,
  onRep,
  onBack,
  onReview,
}: {
  candidate: Candidate
  rep: 'left' | 'right' | null
  onRep: (r: 'left' | 'right') => void
  onBack: () => void
  onReview: () => void
}) {
  const recommend = candidate.left.records >= candidate.right.records ? 'left' : 'right'
  return (
    <div>
      <button onClick={onBack} className="mb-3 text-sm font-medium text-primary hover:underline">‹ 후보 목록으로</button>

      <div className="grid grid-cols-2 gap-3">
        {(['left', 'right'] as const).map((side) => {
          const p = candidate[side]
          const isRep = rep === side
          const isRecommend = recommend === side
          return (
            <section
              key={side}
              className={`rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)] transition-colors ${
                isRep ? 'border-primary ring-1 ring-primary/40' : 'border-border/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{p.name}</span>
                </div>
                {isRep ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                    <Check className="h-3.5 w-3.5" /> 대표 환자
                  </span>
                ) : rep ? (
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">병합되어 비활성화될 후보</span>
                ) : null}
              </div>

              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">생년월일 · 전화</dt>
                  <dd className="tabular-nums">{maskBirth(p.birth)} · {maskPhone(p.phone)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">계정 연결</dt>
                  <dd>{p.linked ? <Tag className="!bg-primary/10 !text-primary">연결됨</Tag> : <span className="text-muted-foreground">미연결</span>}</dd>
                </div>
                {METRICS.map((m) => (
                  <div key={m.key} className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-muted-foreground"><m.Icon className="h-3.5 w-3.5" />{m.label}</dt>
                    <dd className="tabular-nums">{p[m.key] as number}건</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">마지막 방문일</dt>
                  <dd className="tabular-nums">{p.lastVisit || <span className="text-muted-foreground">방문 없음</span>}</dd>
                </div>
              </dl>

              <button
                onClick={() => onRep(side)}
                className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  isRep ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card hover:bg-muted'
                }`}
              >
                {isRep ? '대표로 선택됨' : '대표로 선택'}
                {isRecommend && !isRep && <span className="ml-1.5 text-xs text-muted-foreground">· 기록 많음</span>}
              </button>
            </section>
          )
        })}
      </div>

      {/* 권고 + 계보 보존 안내 — MERGE-COMPARE-03·06 */}
      <div className="mt-3 space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>기록이 더 많은 쪽을 대표로 권합니다. 적은 쪽을 대표로 고르면 앱·이력에서 보이는 범위가 달라질 수 있습니다.</span>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>원본 예약·문진·진료기록·열람 기록은 원래 자리에 남고, 대표 조회가 계보를 따라 함께 읽습니다.</span>
        </div>
      </div>

      {/* 병합 검토 버튼 — 대표 정해야 열림 (MERGE-REVIEW-02) */}
      <div className="mt-4 flex justify-end">
        <button onClick={onReview} disabled={!rep} className={btnGhost} style={{ opacity: rep ? 1 : 0.5 }}>
          <ShieldCheck className="h-4 w-4" /> 병합 내용 검토
        </button>
      </div>
    </div>
  )
}

// ── 확인창 (3단계) — MERGE-CONFIRM-* · 읽음 체크 후에만 파괴 버튼 ──
function ConfirmDialog({
  candidate,
  rep,
  read,
  onRead,
  onCancel,
  onConfirm,
}: {
  candidate: Candidate
  rep: 'left' | 'right'
  read: boolean
  onRead: (v: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const navigate = useNavigate()
  const representative = candidate[rep]
  const absorbed = candidate[rep === 'left' ? 'right' : 'left']
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="merge-confirm-title" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-6 shadow-[var(--elevation-card)]">
        <div className="mb-1 flex items-start justify-between">
          <h2 id="merge-confirm-title" className="text-lg font-bold">병합을 확정할까요?</h2>
          <button onClick={onCancel} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>

        {/* 대표/대상·계정 연결 (MERGE-CONFIRM-01) */}
        <dl className="mt-3 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">대표 환자</dt>
            <dd className="font-medium">{representative.name} · {maskBirth(representative.birth)} {representative.linked && <Tag className="!bg-primary/10 !text-primary">계정 연결</Tag>}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">병합되어 비활성화</dt>
            <dd>{absorbed.name} · {maskBirth(absorbed.birth)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">데이터 소유권</dt>
            <dd className="text-xs text-muted-foreground">원본 보존 · 대표가 계보로 함께 읽음</dd>
          </div>
        </dl>

        {/* 비가역 고지 + 정정 경로 (MERGE-CONFIRM-03 · MERGE-UNDO-02, 막다른 길 방지) */}
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">병합 확정 후 이 화면에서 취소할 수 없습니다.</div>
            <div className="mt-0.5 text-xs text-rose-700/90">
              잘못 병합했다면 <button onClick={() => navigate('/staff/admin/merge-history')} className="font-medium underline">병합 이력 화면</button>에서 관리자가 직접 되돌립니다. 병합 당시 이미 열람된 기록은 되돌릴 수 없습니다.
            </div>
          </div>
        </div>

        {/* 읽음 체크 — 체크해야 확정 열림 (MERGE-CONFIRM-04) */}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={read} onChange={(e) => onRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
          <span>대표·대상, 데이터 소유권, 되돌림 절차를 읽고 이해했습니다.</span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className={btnGhost}>취소</button>
          <button
            onClick={onConfirm}
            disabled={!read}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Users className="h-4 w-4" /> 병합 확정
          </button>
        </div>
      </div>
    </div>
  )
}
