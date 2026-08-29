import { useMutation, useQuery } from '@tanstack/react-query'
import { getAppointmentDetail, type AppointmentDetailData } from '../../api/calendar'
import { transitionStatus } from '../../api/appointments'
import { formatHospitalDateTime } from '../../lib/clock'
import { AppointmentPanel, type SupportSummary } from './AppointmentPanel'

// [CAL-PANEL-*] 딥링크(/today [예약·상담 보기])로 연 예약 패널의 데이터 창구.
//   ⭐ 예전엔 오늘 격자의 막대에서 값을 찾아 채우다 못 찾으면(상담 예약은 대개 미래 날짜) 텅 빈
//      채 열렸다. 이 로더가 예약 한 건을 뷰와 무관하게 직접 읽어 채운다.
//   ⭐ [L1] 취소는 여기서 실행한다 — 패널의 onCancel(reason)이 병원취소 전이(transition_status)를
//      부른다. 예전엔 로더가 onCancel을 안 넘겨 [예약 취소]가 무동작이었다(G1). 성공하면 onDone으로
//      캘린더를 새로고침해 취소된 막대가 사라진다.

interface AppointmentPanelLoaderProps {
  appointmentId: string
  onClose: () => void
  /** 취소가 성공한 뒤 — 패널을 닫고 캘린더 격자를 새로 읽어 취소된 막대를 지운다(openBooking과 같은 패턴). */
  onDone?: () => void
}

/** '취소'/'변경'(서버 request_type)을 패널의 상담 종류로 옮긴다. */
function toSupport(support: AppointmentDetailData['support']): SupportSummary | null {
  if (!support) return null
  return {
    type: support.request_type === '취소' ? 'cancel' : 'reschedule',
    // requested_at은 실제 순간(UTC Z)이라 병원 시각으로 포맷한다 — start(naive 벽시계)와 다르다.
    connectedAtLabel: support.requested_at ? formatHospitalDateTime(support.requested_at) : undefined,
    load: 'ready',
  }
}

/** 병원 벽시계 naive ISO를 'YYYY-MM-DD HH:MM'으로 — 막대와 같은 방식(문자열 슬라이스). */
function timeLabel(start: string | null): string {
  if (!start) return '시각 미정'
  return `${start.slice(0, 10)} ${start.slice(11, 16)}`
}

function doctorLabel(d: AppointmentDetailData): string {
  return `${d.department_name ?? ''} / ${d.doctor_name ?? ''}`.replace(/^ \/ /, '').replace(/ \/ $/, '')
}

export function AppointmentPanelLoader({ appointmentId, onClose, onDone }: AppointmentPanelLoaderProps) {
  const q = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointmentDetail(appointmentId),
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  // 병원취소 전이 — 낙관적 잠금(expected_updated_at)으로 그 사이 다른 직원이 손댔으면 409를 낸다.
  const cancelMut = useMutation({
    mutationFn: (reason: string) =>
      transitionStatus(appointmentId, {
        new_status: '병원취소',
        reason,
        expected_updated_at: q.data!.updated_at,
      }),
    onSuccess: () => onDone?.(),
  })

  if (q.isLoading) {
    return <p className="cal-support-line" role="status">예약을 불러오는 중입니다</p>
  }
  if (q.isError || !q.data) {
    return (
      <div className="cal-appointment-panel">
        <p className="cal-support-line is-error">예약을 불러오지 못했습니다</p>
        <div className="cal-panel-actions">
          <button type="button" className="cal-panel-close" onClick={() => void q.refetch()}>다시 시도</button>
        </div>
      </div>
    )
  }

  const d = q.data
  return (
    <AppointmentPanel
      appointment={{
        appointmentId: d.appointment_id,
        patientLabel: d.patient.name ?? '환자',
        statusLabel: d.status,
        doctorLabel: doctorLabel(d),
        timeLabel: timeLabel(d.start),
      }}
      support={toSupport(d.support)}
      onCancel={(reason) => {
        // mutateAsync는 실패 시 reject한다 — 오류는 cancelMut.isError로 이미 화면에 보이므로
        // 여기선 삼켜 unhandled rejection만 막는다(막다른 길 대신 actionError로 안내).
        void cancelMut.mutateAsync(reason).catch(() => {})
      }}
      actionError={cancelMut.isError ? '예약을 취소하지 못했습니다. 다른 직원이 먼저 처리했을 수 있어요 — 새로고침 후 다시 시도해 주세요.' : null}
      onClose={onClose}
    />
  )
}
