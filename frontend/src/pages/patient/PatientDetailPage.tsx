import { type CSSProperties } from 'react'
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { homeFor, type Role } from '../../auth/roles'
import { usePanel } from '../../components/PanelHost'
import { ApiError } from '../../api/httpClient'
import {
  addPatientNote,
  getPatientDetail,
  getPatientFamily,
  getPatientMedicalRecords,
  getPatientNotes,
  getPatientVisits,
  getQuestionnaire,
  type PatientHistoryRow,
  type PatientNote,
} from '../../api/patients'
import { Header } from './Header'
import { StatusCard, type StatusItem } from './StatusCard'
import { FamilySection } from './FamilySection'
import { VisitSection } from './VisitSection'
import { QuestionnaireSection, type QnrItem } from './QuestionnaireSection'
import { RecordSection } from './RecordSection'
import { SupportSection } from './SupportSection'
import { NoteSection } from './NoteSection'
import { PhoneChangePanel } from './PhoneChangePanel'
import type { SectionState } from './format'

// [PTDET-*] /patients/:id — 모든 목록 화면이 도착하는 곳(NAV-SHELL-10). 헤더 요약 + 2열 섹션 그리드(#1).
//
// ⭐ 섹션마다 독립적으로 실패한다(PTDET-LOAD-02) — 하나의 Promise.all로 묶지 않는다. 각 섹션이 자기
//    쿼리를 걸어, 문진 하나가 403이어도 예약 이력은 남는다.
// ⭐ 문진은 role이 doctor일 때만 요청한다(PTDET-QNR-03) — 접수직원·관리자에겐 answers가 실리지 않는다.

const ACTIVE_STATUSES = new Set(['도착', '진료대기', '진료중', '예약확정', '예약신청'])

function toStatusItem(r: PatientHistoryRow): StatusItem {
  return {
    occurred_at: r.occurred_at,
    department_name: r.department_name ?? null,
    doctor_name: r.doctor_name ?? null,
    status: r.status ?? '',
  }
}

export function PatientDetailPage() {
  const { id = '' } = useParams()
  const { staff } = useAuth()
  const role: Role = staff?.role ?? 'receptionist'
  const navigate = useNavigate()
  const client = useQueryClient()
  const { openPanel, closePanel } = usePanel()

  const detailQ = useQuery({ queryKey: ['patient', id], queryFn: () => getPatientDetail(id) })

  const visitsQ = useInfiniteQuery({
    queryKey: ['patient', id, 'visits'],
    queryFn: ({ pageParam }) => getPatientVisits(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : undefined),
  })
  const visitRows = visitsQ.data?.pages.flatMap((p) => p.rows) ?? []

  const recordsQ = useQuery({
    queryKey: ['patient', id, 'records'],
    queryFn: () => getPatientMedicalRecords(id),
  })

  const familyQ = useQuery({
    queryKey: ['patient', id, 'family'],
    queryFn: () => getPatientFamily(id),
    // 가족 조회 창구는 접수·관리자만(서버 _STAFF). 의사는 애초에 상세를 못 연다.
    enabled: role !== 'doctor',
  })

  const notesQ = useQuery({ queryKey: ['patient', id, 'notes'], queryFn: () => getPatientNotes(id) })

  // [QNR-03] 담당 의사일 때만 문진을 요청한다 — 그 밖의 역할에선 쿼리 자체가 없다(빈 배열).
  const qnrQueries = useQueries({
    queries: (role === 'doctor' ? visitRows : []).map((v) => ({
      queryKey: ['questionnaire', v.id],
      queryFn: () => getQuestionnaire(v.id),
    })),
  })
  const qnrItems: QnrItem[] = qnrQueries
    .map((q, i) => ({ data: q.data?.questionnaire, visit: visitRows[i] }))
    .filter((x) => x.data && x.data.submitted_at)
    .map((x) => ({
      appointment_id: x.data!.appointment_id,
      visit_date: x.visit?.occurred_at,
      submitted_at: x.data!.submitted_at as string,
      answers: x.data!.answers,
    }))

  const addNote = useMutation({
    mutationFn: (content: string) => addPatientNote(id, content),
    onSuccess: () => client.invalidateQueries({ queryKey: ['patient', id, 'notes'] }),
  })

  // ── 상태 카드: 방문 이력에서 「지금」과 「최근」을 뽑는다(따로 계산하지 않는다, VISIT-04). ──
  const current = visitRows.find((r) => ACTIVE_STATUSES.has(r.status ?? ''))
  const recent = visitRows.find((r) => r.status === '진료완료')

  // ── 상세 자체가 막힌 경우: 권한 안내 + 역할 기본 화면(막다른 길을 만들지 않는다, ACTION-06). ──
  if (detailQ.isError) {
    const status = detailQ.error instanceof ApiError ? detailQ.error.status : 0
    if (status === 403) {
      return (
        <section aria-label="환자 상세" style={styles.blocked}>
          <p style={styles.blockedText}>이 화면을 볼 권한이 없습니다</p>
          <button type="button" onClick={() => navigate(homeFor(role))} style={styles.escapeBtn}>
            내 화면으로
          </button>
        </section>
      )
    }
  }

  function openPhoneChange() {
    openPanel({
      title: '전화번호 변경',
      content: (
        <PhoneChangePanel
          currentPhone={detailQ.data?.phone ?? ''}
          // ⏳ BLOCKED — OTP 발송·검증 창구가 아직 없다(갭 #19). 흐름만 완성하고 서버는 거절한다.
          onRequestCode={async () => {
            throw new ApiError('본인확인(OTP) 창구가 아직 열리지 않았습니다.', 501)
          }}
          onConfirm={async () => {
            throw new ApiError('본인확인(OTP) 창구가 아직 열리지 않았습니다.', 501)
          }}
          onDone={() => {
            client.invalidateQueries({ queryKey: ['patient', id] })
            closePanel()
          }}
        />
      ),
    })
  }

  function openFamilyLink() {
    // [ACTION-01] 화면을 옮기지 않고 패널로 연다 — 현재 환자 헤더가 계속 보인다.
    // ⏳ 대상 검색·본인확인 분기는 Task 13이 서버를 채운다(BLOCKED). 여기선 패널 그릇만 연다.
    openPanel({
      title: '가족 연결',
      content: <p style={styles.panelStub}>대상 환자를 검색해 관계를 확인합니다. (본인확인 창구는 준비 중입니다)</p>,
    })
  }

  const visitState: SectionState<{ rows: PatientHistoryRow[]; hasMore: boolean }> = {
    loading: visitsQ.isLoading,
    error: visitsQ.isError,
    data: { rows: visitRows, hasMore: Boolean(visitsQ.hasNextPage) },
    retry: () => void visitsQ.refetch(),
  }
  const recordState: SectionState<{ rows: PatientHistoryRow[] }> = {
    loading: recordsQ.isLoading,
    error: recordsQ.isError,
    data: { rows: recordsQ.data?.rows ?? [] },
    retry: () => void recordsQ.refetch(),
  }
  const familyState: SectionState<PatientHistoryRow[]> = {
    loading: familyQ.isLoading && role !== 'doctor',
    error: familyQ.isError,
    data: familyQ.data ?? [],
    retry: () => void familyQ.refetch(),
  }
  const noteState: SectionState<PatientNote[]> = {
    loading: notesQ.isLoading,
    error: notesQ.isError,
    data: notesQ.data,
    retry: () => void notesQ.refetch(),
  }
  const qnrLoading = qnrQueries.some((q) => q.isLoading)
  const qnrError = qnrQueries.some((q) => q.isError)
  const qnrState: SectionState<QnrItem[]> = {
    loading: qnrLoading,
    error: qnrError,
    data: qnrItems,
    retry: () => qnrQueries.forEach((q) => void q.refetch()),
  }
  // 상담 문의는 서버(4단계)가 없다 — 소비만 하는 자리라 0건으로 둔다(SUPPORT BLOCKED).
  const supportState: SectionState<never[]> = { loading: false, error: false, data: [], retry: () => {} }

  return (
    <section aria-label="환자 상세" style={styles.page}>
      <Header
        patient={detailQ.data}
        role={role}
        loading={detailQ.isLoading}
        onChangePhone={openPhoneChange}
      />
      <StatusCard
        current={current ? toStatusItem(current) : null}
        recent={recent ? toStatusItem(recent) : null}
        loading={visitsQ.isLoading}
      />

      <div style={styles.grid}>
        <VisitSection state={visitState} onMore={() => void visitsQ.fetchNextPage()} moreLoading={visitsQ.isFetchingNextPage} />
        <QuestionnaireSection role={role} state={qnrState} />
        <RecordSection state={recordState} />
        <FamilySection state={familyState} onAddLink={openFamilyLink} />
        <SupportSection state={supportState} />
        <NoteSection state={noteState} onAdd={(content) => addNote.mutateAsync(content).then(() => undefined)} />
      </div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  // [DEMO-REVIEW F-8/line103] 2열 섹션 그리드 — 넓은 화면에서도 최대 2열(데모 max-w-5xl · grid-cols-2).
  //   실은 auto-fit minmax(320)라 넓은 화면에서 3열로 벌어졌다 → 폭을 캡하고 최소칸을 키워 2열로.
  page: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1040 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
    gap: 12,
    alignItems: 'start',
  },
  blocked: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, padding: 24,
    background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  blockedText: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  escapeBtn: {
    height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-base)', fontWeight: 600, cursor: 'pointer',
  },
  panelStub: { margin: 0, fontSize: 'var(--fs-base)', color: 'var(--color-ink-muted)' },
}
