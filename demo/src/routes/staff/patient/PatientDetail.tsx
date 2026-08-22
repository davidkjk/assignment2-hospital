import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { LockKeyhole, Phone, UserRound } from '@/components/icons'
import { useStaff } from '../staffState'

// 환자 상세 (/patients/:id) — PTDET-*.
// 헤더 요약 + 2열 섹션 그리드(탭 아님). 목록이 아니라 단건이라 전화·생년월일 전체 노출(PTDET-HEAD-01).
// 진입 자체가 서버 열람 기록(데모는 생략). 사전문진은 담당 의사만(관리자·접수 비열람, PTDET-QNR-03).

// 데모 환자 1명(실제 앱은 :id로 서버 조회). 어느 id로 들어와도 이 환자를 보여준다.
const DEMO = {
  name: '김태호',
  birth: '1972-11-03',
  sex: '남',
  tel: '010-4821-9930',
  relation: '본인',
  current: { date: '오늘', time: '09:05', dept: '내과', doctor: '이정훈', status: '진료 대기', order: 2 },
  family: [
    { name: '이수진', relation: '배우자' },
    { name: '김하늘', relation: '자녀' },
  ],
  visits: [
    { date: '2026-08-22', time: '09:05', dept: '내과', doctor: '이정훈', status: '진료 대기', current: true },
    { date: '2026-06-10', time: '10:30', dept: '내과', doctor: '이정훈', status: '진료 완료' },
    { date: '2026-03-02', time: '14:00', dept: '정형외과', doctor: '박강우', status: '진료 완료' },
    { date: '2026-01-18', time: '11:20', dept: '내과', doctor: '한서연', status: '환자 취소' },
  ],
  records: [
    { date: '2026-06-10', dept: '내과', doctor: '이정훈', dx: '고혈압 경과 관찰 · 약 처방' },
    { date: '2026-03-02', dept: '정형외과', doctor: '박강우', dx: '우측 어깨 회전근개 염좌' },
  ],
  support: [{ status: '처리 중', q: '예약 시간을 오후로 바꾸고 싶어요', at: '08-21 14:20' }],
}

const STATUS_TONE: Record<string, string> = {
  '진료 대기': 'bg-sky-600',
  '진료 완료': 'bg-slate-500',
  '환자 취소': 'bg-amber-500',
  '병원 취소': 'bg-amber-500',
  '예약 부도': 'bg-slate-600',
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-white ${STATUS_TONE[status] ?? 'bg-slate-500'}`}>
      {status}
    </span>
  )
}

export function PatientDetail() {
  useParams() // :id (데모는 고정 환자)
  const { staff } = useStaff()
  const canReadQnr = staff.role === 'doctor' // 담당 의사만(PTDET-QNR-03, 관리자·접수 비열람)
  const [notes, setNotes] = useState([{ text: '지난 방문 때 대기 오래 하심 — 다음엔 앞 순번 배정', by: '박지민', at: '08-20 10:12' }])
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      {/* ── 헤더 요약 (전체 노출) ── */}
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <UserRound className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">{DEMO.name}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{DEMO.relation}</span>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {DEMO.birth} · {DEMO.sex} · {DEMO.tel}
              </div>
            </div>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Phone className="h-4 w-4 text-primary" />
            전화번호 변경
          </button>
        </div>
      </div>

      {/* ── 현재 예약·상태 ── */}
      <div className="mt-3 rounded-xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">현재 예약</div>
            <div className="mt-1">
              <span className="font-semibold">{DEMO.current.date} {DEMO.current.time}</span>
              <span className="ml-2 text-muted-foreground">{DEMO.current.dept} {DEMO.current.doctor}</span>
            </div>
          </div>
          <div className="text-right">
            <Badge status={DEMO.current.status} />
            <div className="mt-1 text-xs text-muted-foreground">대기 {DEMO.current.order}번</div>
          </div>
        </div>
      </div>

      {/* ── 2열 섹션 그리드 ── */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* 가족 관계 */}
        <Section
          title="가족"
          action={<button className="text-xs font-medium text-primary hover:underline">가족 연결 추가</button>}
        >
          <ul className="divide-y divide-border/60">
            {DEMO.family.map((f) => (
              <li key={f.name} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{f.name}</span>
                <span className="text-muted-foreground">{f.relation}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* 사전문진 — 담당 의사만 열람 (PTDET-QNR-03) */}
        <Section title="사전문진">
          {canReadQnr ? (
            <div className="text-sm text-muted-foreground">문진 응답 표시(담당 의사)</div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
              <LockKeyhole className="h-4 w-4" />
              담당 의사만 열람할 수 있습니다
            </div>
          )}
        </Section>

        {/* 예약·방문 이력 */}
        <Section title="예약·방문 이력">
          <ul className="divide-y divide-border/60">
            {DEMO.visits.map((v, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{v.date.slice(5)} {v.time}</span>
                <span className="min-w-0 flex-1 truncate">
                  {v.dept} {v.doctor}
                  {v.current && <span className="ml-1.5 text-xs font-medium text-primary">현재</span>}
                </span>
                <Badge status={v.status} />
              </li>
            ))}
          </ul>
        </Section>

        {/* 완료 진료기록 — 읽기 전용(접수·관리자는 쓰기 버튼 없음, PTDET-RECORD-03) */}
        <Section title="완료된 진료기록">
          <ul className="divide-y divide-border/60">
            {DEMO.records.map((r, i) => (
              <li key={i} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="tabular-nums text-muted-foreground">{r.date}</span>
                  <span className="text-xs text-muted-foreground">{r.dept} {r.doctor}</span>
                </div>
                <div className="mt-0.5">{r.dx}</div>
              </li>
            ))}
          </ul>
        </Section>

        {/* 상담 문의 */}
        <Section title="상담 문의">
          {DEMO.support.length === 0 ? (
            <div className="text-sm text-muted-foreground">직원에게 전달된 상담 문의가 없습니다</div>
          ) : (
            <ul className="space-y-2">
              {DEMO.support.map((s, i) => (
                <li key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge status={s.status === '처리 중' ? '진료 대기' : s.status} />
                    <span className="text-xs text-muted-foreground">{s.at}</span>
                  </div>
                  <div className="mt-1">{s.q}</div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 내부 메모 — 추가 가능 */}
        <Section
          title="내부 메모"
          action={
            !adding && (
              <button onClick={() => setAdding(true)} className="text-xs font-medium text-primary hover:underline">
                내부 메모 추가
              </button>
            )
          }
        >
          {adding && (
            <div className="mb-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="내부 메모 (직원끼리만 보임)"
                className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button onClick={() => { setAdding(false); setDraft('') }} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
                  취소
                </button>
                <button
                  disabled={!draft.trim()}
                  onClick={() => {
                    setNotes((n) => [{ text: draft.trim(), by: staff.name, at: '방금' }, ...n])
                    setDraft('')
                    setAdding(false)
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            </div>
          )}
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li key={i} className="text-sm">
                <div>{n.text}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{n.by} · {n.at}</div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">데모 화면입니다 · 가짜 데이터로 정상 흐름을 보여 줍니다</p>
    </div>
  )
}
