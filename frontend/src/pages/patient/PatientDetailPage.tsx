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
  requestPhoneChange,
  confirmPhoneChange,
  type PatientHistoryRow,
  type PatientNote,
} from '../../api/patients'
import { Header } from './Header'
import { FamilySection } from './FamilySection'
import { VisitSection } from './VisitSection'
import { QuestionnaireSection, type QnrItem, type QnrStatus } from './QuestionnaireSection'
import { RecordSection } from './RecordSection'
import { PatientSupportSection } from './PatientSupportSection'
import { patientSupportApi } from '../../api/patientSupport'
import { NoteSection } from './NoteSection'
import { PhoneChangePanel } from './PhoneChangePanel'
import type { SectionState } from './format'

// [PTDET-*] /patients/:id — 모든 목록 화면이 도착하는 곳(NAV-SHELL-10). 헤더 요약 + 2열 섹션 그리드(#1).
//
// ⭐ 섹션마다 독립적으로 실패한다(PTDET-LOAD-02) — 하나의 Promise.all로 묶지 않는다. 각 섹션이 자기
//    쿼리를 걸어, 문진 하나가 403이어도 예약 이력은 남는다.
// ⭐ 문진은 role이 doctor일 때만 요청한다(PTDET-QNR-03) — 접수직원·관리자에겐 answers가 실리지 않는다.
//
// [PTDET-STATUS 은퇴] 예전의 「지금 상태」 한 줄 카드(StatusCard)는 뺐다(2026-08-31 손검수 ⑥) — 바로 아래
//   예약·방문 이력 첫 줄(「현재」 배지 포함)과 중복이었다. 결정로그·동작명세에 역참조를 남겼다.

const ACTIVE_STATUSES = new Set(['도착', '진료대기', '진료중', '예약확정', '예약신청'])

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

  // [QNR-03] 담당 의사일 때만 답변 '내용'을 요청한다 — 그 밖의 역할에선 쿼리 자체가 없다(빈 배열).
  const qnrQueries = useQueries({
    queries: (role === 'doctor' ? visitRows : []).map((v) => ({
      queryKey: ['questionnaire', v.id],
      queryFn: () => getQuestionnaire(v.id),
    })),
  })

  // [QNR-03 A안] 직원용 '작성 여부' — 내용 없이 방문 이력에 실려온 제출 시각으로 판정한다(서버 00076).
  //   작성완료(제출 시각 있음)는 전부, 미작성은 지금/다가오는 예약만(지난 완료·취소분은 요청할 게 없다).
  const qnrStatuses: QnrStatus[] =
    role === 'doctor'
      ? []
      : visitRows
          .filter((v) => v.questionnaire_submitted_at || ACTIVE_STATUSES.has(v.status ?? ''))
          .map((v) => ({
            appointment_id: v.id,
            visit_date: v.occurred_at,
            submitted_at: v.questionnaire_submitted_at ?? null,
          }))
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
          // [PTDET-ACTION-02][갭 #19·결정 #4] 새 번호 OTP 소유 증명 창구(배포 Task 7D). 실패 문구는
          //   서버 문장을 그대로 패널에 보인다(쿨다운 429·만료·틀린 코드 등) — 조용한 먹통을 막는다.
          onRequestCode={async (newPhone) => {
            await requestPhoneChange(id, newPhone)
          }}
          onConfirm={async (newPhone, code) => {
            await confirmPhoneChange(id, newPhone, code)
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
  // 의사는 답변 쿼리들의 상태를, 직원은 '작성 여부'가 실려오는 방문 이력의 상태를 그대로 쓴다.
  const qnrState: SectionState<QnrItem[]> =
    role === 'doctor'
      ? {
          loading: qnrQueries.some((q) => q.isLoading),
          error: qnrQueries.some((q) => q.isError),
          data: qnrItems,
          retry: () => qnrQueries.forEach((q) => void q.refetch()),
        }
      : {
          loading: visitsQ.isLoading,
          error: visitsQ.isError,
          data: [],
          retry: () => void visitsQ.refetch(),
        }
  return (
    <section aria-label="환자 상세" style={styles.page}>
      <Header
        patient={detailQ.data}
        role={role}
        loading={detailQ.isLoading}
        onChangePhone={openPhoneChange}
        // [PTDET-HEAD-07] 가족 관계를 맨 윗 카드 오른쪽 단으로 합친다(손검수 ⑥). 의사는 가족 창구가 없다.
        rightSlot={role !== 'doctor' ? <FamilySection bare state={familyState} onAddLink={openFamilyLink} /> : undefined}
      />

      <div style={styles.grid}>
        <VisitSection state={visitState} onMore={() => void visitsQ.fetchNextPage()} moreLoading={visitsQ.isFetchingNextPage} />
        <QuestionnaireSection
          role={role}
          state={qnrState}
          statuses={qnrStatuses}
          onRequest={role !== 'doctor' ? () => navigate('/messages') : undefined}
        />
        <RecordSection state={recordState} />
        {/* [PTSUP-SECT] 환자 범위 상담 문의 — 카드 선택은 티켓·대화 상세(문의함)로(NAV-STFSUP-07). */}
        <PatientSupportSection
          patientId={id}
          api={patientSupportApi}
          onOpenTicket={({ ticketId }) => navigate(`/tickets?ticket=${ticketId}`)}
        />
        <NoteSection state={noteState} onAdd={(content) => addNote.mutateAsync(content).then(() => undefined)} />
      </div>
    </section>
  )
}

const styles: Record<string, CSSProperties> = {
  // [DEMO-REVIEW F-8/line103] 2열 섹션 그리드 — 넓은 화면에서도 최대 2열(데모 max-w-5xl · grid-cols-2).
  //   실은 auto-fit minmax(320)라 넓은 화면에서 3열로 벌어졌다 → 폭을 캡하고 최소칸을 키워 2열로.
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxWidth: 1040 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))',
    gap: 'var(--sp-3)',
    // 나란한 카드는 같은 높이로(2026-08-31 손검수) — 각 카드가 그 줄에서 가장 높은 것에 맞춰 늘어난다.
    alignItems: 'stretch',
  },
  blocked: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--sp-3)', padding: 'var(--sp-6)',
    background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-card)',
  },
  blockedText: { margin: 0, fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-title)' as CSSProperties['fontWeight'], color: 'var(--color-ink)' },
  escapeBtn: {
    height: 34, padding: '0 var(--sp-4)', borderRadius: 8, border: '1px solid var(--color-primary)',
    background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--fs-body)', fontWeight: 'var(--fw-section)' as CSSProperties['fontWeight'], cursor: 'pointer',
  },
  panelStub: { margin: 0, fontSize: 'var(--fs-body)', color: 'var(--color-ink-muted)' },
}
