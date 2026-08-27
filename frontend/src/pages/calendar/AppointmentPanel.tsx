import { useState } from 'react'
import { BusyButton } from '../../components/BusyButton'
import { ReasonPromptDialog } from '../../components/ReasonPromptDialog'

// [CAL-PANEL-*] 예약 상세 — 변경·취소·사유. ⚠ 상담 요약을 흡수한다(SUPPORT-CAL-*, MR2-10).
//   ⭐ 상담용 두 번째 패널을 만들지 않는다(SUPPORT-CAL-WARN-03) — 같은 예약 패널에 읽기 전용 요약만.
//   ⛔ 전체 대화를 복제하지 않는다. ⛔ 별도 대기열·희망 일시를 만들지 않는다.

export type SupportType = 'cancel' | 'reschedule'
export type SupportLoad = 'loading' | 'error' | 'ready'

export interface SupportSummary {
  type: SupportType
  /** 연결 시각(상담으로 넘어간 때). */
  connectedAtLabel?: string
  /** 담당 직원 — 없으면 미배정. */
  ownerLabel?: string
  load: SupportLoad
}

export interface AppointmentDetail {
  appointmentId: string
  patientLabel: string
  statusLabel: string
  doctorLabel: string
  timeLabel: string
}

export interface AppointmentPanelProps {
  appointment: AppointmentDetail
  support?: SupportSummary | null
  onReschedule?: () => void
  onCancel?: (reason: string) => void | Promise<void>
  onClose?: () => void
}

const SUPPORT_TITLE: Record<SupportType, string> = {
  cancel: '취소 상담',
  reschedule: '변경 상담',
}

export function AppointmentPanel({ appointment, support, onReschedule, onCancel, onClose }: AppointmentPanelProps) {
  const [asking, setAsking] = useState(false)

  return (
    <div className="cal-appointment-panel">
      <header className="cal-panel-head">
        <h2 className="cal-panel-title">
          {appointment.patientLabel} · {appointment.statusLabel}
        </h2>
        {onClose && (
          <button type="button" aria-label="닫기" className="cal-panel-close" onClick={onClose}>
            ✕
          </button>
        )}
      </header>

      <dl className="cal-panel-fields">
        <div>
          <dt>의사</dt>
          <dd>{appointment.doctorLabel}</dd>
        </div>
        <div>
          <dt>시간</dt>
          <dd>{appointment.timeLabel}</dd>
        </div>
      </dl>

      {support && (
        <section className="cal-support-summary" data-testid="support-summary" aria-label="상담 요약">
          {support.load === 'loading' ? (
            <p className="cal-support-line">확인 중</p>
          ) : support.load === 'error' ? (
            <p className="cal-support-line is-error">상담 상태를 확인할 수 없습니다</p>
          ) : (
            <>
              <p className="cal-support-line">{SUPPORT_TITLE[support.type]}</p>
              {support.connectedAtLabel && <p className="cal-support-line">연결 {support.connectedAtLabel}</p>}
              <p className="cal-support-line">담당: {support.ownerLabel ?? '미배정'}</p>
            </>
          )}
        </section>
      )}

      <div className="cal-panel-actions">
        {/* ⭐ 되돌릴 수 없는 취소는 빨간 버튼을 확인창 안에서만(CLAUDE.md 설계 원칙). */}
        <BusyButton label="예약 변경" onClick={onReschedule} />
        <button type="button" className="cal-cancel-link" onClick={() => setAsking(true)}>
          예약 취소
        </button>
      </div>

      {asking && (
        <ReasonPromptDialog
          title="예약을 취소할까요?"
          hint="취소 사유를 남기면 나중에 확인할 수 있습니다."
          onSubmit={(reason) => {
            setAsking(false)
            void onCancel?.(reason)
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  )
}
