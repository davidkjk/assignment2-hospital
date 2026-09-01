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
  /** 대표 티켓 id — [상담 전체 보기]가 이 티켓으로 간다(SUPPORT-CAL-DUP-01). 없으면 버튼 없음. */
  ticketId?: string
  /** 이 예약에 붙은 상담 기록 수 — 「상담 N건」 병기(SUPPORT-CAL-DUP-01). */
  count?: number
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
  /** 대표 티켓의 문의함 상세로 이동(SUPPORT-PANEL-CONTEXT-01). 배선은 CalendarPage. */
  onOpenTicket?: (ticketId: string) => void
}

const SUPPORT_TITLE: Record<SupportType, string> = {
  cancel: '취소 상담',
  reschedule: '변경 상담',
}

export function AppointmentPanel({ appointment, support, onReschedule, onCancel, onClose, onOpenTicket }: AppointmentPanelProps) {
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
              <p className="cal-support-line">
                {SUPPORT_TITLE[support.type]}
                {/* SUPPORT-CAL-DUP-01: 대표 하나 + 상담 기록 수 병기(⚠는 겹쳐 안 그린다). */}
                {support.count && support.count > 1 && (
                  <>
                    {' · '}
                    <span className="cal-support-count">상담 {support.count}건</span>
                  </>
                )}
              </p>
              {support.connectedAtLabel && <p className="cal-support-line">연결 {support.connectedAtLabel}</p>}
              <p className="cal-support-line">담당: {support.ownerLabel ?? '직원 확인 중'}</p>
              {/* CONTEXT-01: 답장·상담 내용은 문의함에서. 이 패널은 읽기 전용(대화 복제 금지). */}
              <p className="cal-support-note">답장·상담 내용은 문의함에서 봅니다. 이 패널은 읽기 전용입니다.</p>
              {support.ticketId && onOpenTicket && (
                <button
                  type="button"
                  className="cal-support-open"
                  onClick={() => onOpenTicket(support.ticketId!)}
                >
                  상담 전체 보기
                </button>
              )}
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
