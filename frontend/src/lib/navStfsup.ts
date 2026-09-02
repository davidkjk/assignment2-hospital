// 지원 화면 사이 이동·복귀(NAV-STFSUP) — 문의함·상세·캘린더·패널·상담로그·오답신고·환자상세를 오갈 때
// 어디로 가고 무엇을 복원하는지를 한 곳에서 결정하는 순수 함수. 화면은 이 결과만 읽어 이동한다.
//
// ⭐ 공통 원칙(R2-3): 출발 화면의 직전 필터·검색어·스크롤·선택 맥락을 복원한다.
//    문의 티켓함만 분할 작업공간 예외(왼쪽 목록·탭·정렬·스크롤 유지 + 오른쪽 상세, 좁은 창은 [문의 목록]).
//    나머지는 전체화면 원칙. ⭐ 복원값 저장 위치·만료·새로고침 유지는 근거가 없어 unknown(발명 금지).

export interface StfsupContext {
  from: string
  narrow?: boolean
  restoreKey?: string
  appointmentId?: string
  patientId?: string
}

export interface StfsupEvent {
  type: string
  ticketId?: string
  messageId?: string
  appointmentId?: string
  reason?: string
}

/** 이동 결정 — 필요한 필드만 채운다(화면이 toMatchObject로 읽는다). */
export interface StfsupNav {
  to?: string
  tab?: string
  back?: string
  backLabel?: string
  keepLeftList?: boolean
  replace?: 'right'
  fullWidth?: boolean
  fullscreen?: boolean
  stay?: boolean
  split?: boolean
  restore?: string
  restoreAfterSave?: string
  patientId?: string
  appointmentId?: string
  selectAppointment?: string
  openPanel?: boolean
  singlePanel?: boolean
  exposeContent?: boolean
  persistenceContract?: 'unknown'
}

export function resolveStfsupNav(ctx: StfsupContext, ev: StfsupEvent): StfsupNav {
  const appt = ctx.appointmentId ?? ev.appointmentId

  switch (ev.type) {
    // NAV-STFSUP-01/05/07: '카드 선택'은 출발 화면에 따라 도착지가 다르다.
    case 'select':
      if (ctx.from === 'today-inquiry-card') return { to: 'inbox', tab: 'new', back: 'today' }
      if (ctx.from === 'chatlog') return { to: 'chatlog-detail', fullscreen: true, restore: ctx.restoreKey }
      if (ctx.from === 'patient-support')
        return { to: 'ticket-detail', fullscreen: true, restore: ctx.restoreKey, patientId: ctx.patientId }
      return { to: ctx.from }

    // NAV-STFSUP-02: 문의 티켓함은 분할 작업공간 — 왼쪽 목록 유지·오른쪽 상세만(좁은 창은 전체폭+[문의 목록]).
    case 'selectTicket':
      return ctx.narrow
        ? { to: 'inbox-detail', fullWidth: true, backLabel: '문의 목록' }
        : { to: 'inbox-detail', keepLeftList: true, replace: 'right' }

    // NAV-STFSUP-03/04: 티켓 상세 [보내기]·재배정 성공은 같은 전체 화면에 머문다(봇 복귀·목록 이동 없음).
    case 'sendSuccess':
    case 'reassignSuccess':
      return { to: 'inbox-detail', stay: true }

    // NAV-STFSUP-06: 봇 답변 '잘못된 답변'은 오답 신고 작성을 별도 전체 화면으로(저장/취소 후 직전 위치 복원). 폼은 Task 21.
    case 'reportBad':
      return { to: 'badrpt-form', fullscreen: true, restore: ctx.restoreKey }

    // NAV-STFSUP-08: /today 상담 행 [예약·상담 보기]는 예약 선택된 캘린더+패널로(/cancellation-requests 안 감).
    case 'openReservation':
      return { to: 'calendar', selectAppointment: appt, openPanel: true }

    // NAV-STFSUP-09: 캘린더 ⚠ 예약 선택은 기존 예약 사이드패널을 연다.
    case 'selectWarnAppointment':
      return { to: 'calendar', openPanel: true, appointmentId: appt }

    // NAV-STFSUP-10: 사이드패널 대화 맥락은 티켓·대화 상세를 열고 돌아오면 캘린더·같은 패널을 복원.
    case 'openConversation':
      return { to: 'ticket-detail', fullscreen: true, restore: ctx.restoreKey }

    // NAV-STFSUP-11: 사이드패널 처리 완료·반려는 캘린더에 머물러 최신 예약·⚠ 상태를 확인.
    case 'processDone':
      return { to: 'calendar', stay: true }

    // NAV-STFSUP-12: 세션 만료·권한 오류는 로그인 복귀·권한 거절이며 환자·대화 내용을 노출하지 않는다.
    case 'authError':
      return { to: 'login', exposeContent: false }

    // NAV-STFSUP-13: 공통 복원 — 문의 티켓함만 분할 예외, 나머지는 전체화면. 저장 위치·만료는 확인 필요(unknown).
    case 'back':
      if (ctx.from === 'inbox') return { split: true, restore: ctx.restoreKey }
      return { fullscreen: true, restore: ctx.restoreKey, persistenceContract: 'unknown' }

    // NAV-STFSUP-14: 티켓 상세 [캘린더에서 예약 처리]는 캘린더로 갔다가 저장 후 문의함 맥락 복원(패널 하나·대화 복제 안 함).
    case 'processInCalendar':
      return { to: 'calendar', selectAppointment: appt, singlePanel: true, restoreAfterSave: ctx.restoreKey }

    default:
      return { to: ctx.from }
  }
}

/** 복원 맥락(필터·검색어·스크롤·선택) — 저장 위치·만료는 근거가 없어 unknown(NAV-STFSUP-13). */
export function restoreContext(key: string | undefined): { key: string | undefined; persistenceContract: 'unknown' } {
  return { key, persistenceContract: 'unknown' }
}
