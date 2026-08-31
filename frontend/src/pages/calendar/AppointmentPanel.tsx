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
  /** 취소/변경 실패 시 인라인으로 보이는 문구(G1 — 무동작 대신 이유를 보인다). */
  actionError?: string | null
}

const SUPPORT_TITLE: Record<SupportType, string> = {
  cancel: '취소 상담',
  reschedule: '변경 상담',
}

// onClose는 PanelHost 머리의 ✕ 닫기가 대신하므로 본문에선 쓰지 않는다(중복 제거) — 계약은 유지.
export function AppointmentPanel({ appointment, support, onReschedule, onCancel, actionError }: AppointmentPanelProps) {
  const [asking, setAsking] = useState(false)

  return (
    <div className="cal-appointment-panel">
      {/* ⛔ 제목·닫기를 다시 두지 않는다 — 패널 머리(PanelHost)가 「예약 상세」와 ✕를 이미 보인다.
          대신 이 예약의 주인공(환자·상태)을 본문 머리로 크게 보인다. */}
      <div className="cal-panel-subject">
        <h2 className="cal-panel-subject-name">{appointment.patientLabel}</h2>
        <span className="cal-status-badge">{appointment.statusLabel}</span>
      </div>

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

      {actionError && (
        <p className="cal-support-line is-error" role="alert">{actionError}</p>
      )}

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
