import { useQuery } from '@tanstack/react-query'
import { getAppointmentDetail, type AppointmentDetailData } from '../../api/calendar'
import { formatHospitalDateTime } from '../../lib/clock'
import { AppointmentPanel, type SupportSummary } from './AppointmentPanel'

// [CAL-PANEL-*] 딥링크(/today [예약·상담 보기])로 연 예약 패널의 데이터 창구.
//   ⭐ 예전엔 오늘 격자의 막대에서 값을 찾아 채우다 못 찾으면(상담 예약은 대개 미래 날짜) 텅 빈
//      채 열렸다. 이 로더가 예약 한 건을 뷰와 무관하게 직접 읽어 채운다.

interface AppointmentPanelLoaderProps {
  appointmentId: string
  onClose: () => void
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

export function AppointmentPanelLoader({ appointmentId, onClose }: AppointmentPanelLoaderProps) {
  const q = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointmentDetail(appointmentId),
    staleTime: 0,
    refetchOnWindowFocus: false,
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
      onClose={onClose}
    />
  )
}
