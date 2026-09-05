import { describe, it, expect } from 'vitest'
import { resolveStfsupNav, restoreContext } from './navStfsup'

describe('navStfsup ① 카드→상세·복귀 (NAV-STFSUP-01~07)', () => {
  it("[NAV-STFSUP-01] /today 일반 상담 카드 선택은 문의함 '새 문의' 탭으로 가고 뒤로는 /today", () => {
    const r = resolveStfsupNav({ from: 'today-inquiry-card' }, { type: 'select' })
    expect(r).toMatchObject({ to: 'inbox', tab: 'new', back: 'today' })
  })

  it('[NAV-STFSUP-02] 문의 티켓함은 분할 작업공간 — 왼쪽 목록 유지·오른쪽 상세만(좁은 창은 [문의 목록] 복귀)', () => {
    const r = resolveStfsupNav({ from: 'inbox', narrow: false }, { type: 'selectTicket', ticketId: 't1' })
    expect(r).toMatchObject({ to: 'inbox-detail', keepLeftList: true, replace: 'right' })
    const narrow = resolveStfsupNav({ from: 'inbox', narrow: true }, { type: 'selectTicket', ticketId: 't1' })
    expect(narrow).toMatchObject({ to: 'inbox-detail', fullWidth: true, backLabel: '문의 목록' })
  })

  it('[NAV-STFSUP-03] 티켓 상세 [보내기] 성공은 같은 전체 화면에 머무르고 봇 복귀·목록 이동을 하지 않는다', () => {
    const r = resolveStfsupNav({ from: 'inbox-detail' }, { type: 'sendSuccess' })
    expect(r).toMatchObject({ to: 'inbox-detail', stay: true })
    expect(r).not.toHaveProperty('botReturn')
  })

  it('[NAV-STFSUP-04] 의료판단 재배정 성공은 같은 상세에 머문다', () => {
    const r = resolveStfsupNav({ from: 'inbox-detail' }, { type: 'reassignSuccess' })
    expect(r).toMatchObject({ to: 'inbox-detail', stay: true })
  })

  it('[NAV-STFSUP-05] 전체 상담 기록에서 상담·봇 답변 선택은 별도 전체 화면을 열고 뒤로 시 필터·검색어·스크롤을 복원한다', () => {
    const r = resolveStfsupNav({ from: 'chatlog', restoreKey: 'chatlog:web:s120' }, { type: 'select', messageId: 'm1' })
    expect(r).toMatchObject({ to: 'chatlog-detail', fullscreen: true, restore: 'chatlog:web:s120' })
  })

  it('[NAV-STFSUP-06] 봇 답변 잘못된 답변은 오답 신고 작성을 별도 전체 화면으로 열고 저장/취소 후 직전 위치로 복원한다', () => {
    const r = resolveStfsupNav({ from: 'chatlog', restoreKey: 'chatlog:web:s120' }, { type: 'reportBad', messageId: 'm1' })
    expect(r).toMatchObject({ to: 'badrpt-form', fullscreen: true, restore: 'chatlog:web:s120' })
  })

  it('[NAV-STFSUP-07] 환자상세 상담 문의 카드 선택은 티켓·대화 상세를 열고 현재 환자+필터를 복원한다', () => {
    const r = resolveStfsupNav({ from: 'patient-support', patientId: 'p1', restoreKey: 'ptsup:p1:s0' }, { type: 'select', ticketId: 't1' })
    expect(r).toMatchObject({ to: 'ticket-detail', fullscreen: true, restore: 'ptsup:p1:s0', patientId: 'p1' })
  })
})

describe('navStfsup ② 예약·캘린더·패널·공통 (NAV-STFSUP-08~14)', () => {
  it('[NAV-STFSUP-08] /today 상담 행 [예약·상담 보기]는 예약 선택된 캘린더+패널로 가고 /cancellation-requests를 경유하지 않는다', () => {
    const r = resolveStfsupNav({ from: 'today-support-row', appointmentId: 'a1' }, { type: 'openReservation' })
    expect(r).toMatchObject({ to: 'calendar', selectAppointment: 'a1', openPanel: true })
    expect(r.to).not.toBe('cancellation-requests')
  })

  it('[NAV-STFSUP-09] 캘린더 ⚠ 예약 선택은 기존 예약 사이드패널을 연다', () => {
    const r = resolveStfsupNav({ from: 'calendar' }, { type: 'selectWarnAppointment', appointmentId: 'a1' })
    expect(r).toMatchObject({ to: 'calendar', openPanel: true, appointmentId: 'a1' })
  })

  it('[NAV-STFSUP-10] 사이드패널 대화 맥락은 티켓·대화 상세를 열고 돌아오면 캘린더·같은 패널을 복원한다', () => {
    const r = resolveStfsupNav({ from: 'reservation-panel', appointmentId: 'a1', restoreKey: 'cal:0819:panel:a1' }, { type: 'openConversation', ticketId: 't1' })
    expect(r).toMatchObject({ to: 'ticket-detail', fullscreen: true, restore: 'cal:0819:panel:a1' })
  })

  it('[NAV-STFSUP-11] 사이드패널 처리 완료·반려는 캘린더에 머물러 최신 예약·⚠ 상태를 확인한다', () => {
    const r = resolveStfsupNav({ from: 'reservation-panel' }, { type: 'processDone' })
    expect(r).toMatchObject({ to: 'calendar', stay: true })
  })

  it('[NAV-STFSUP-12] 세션 만료·권한 오류는 로그인 복귀·권한 거절이며 환자·대화 내용을 노출하지 않는다', () => {
    const r = resolveStfsupNav({ from: 'inbox-detail' }, { type: 'authError', reason: 'expired' })
    expect(r).toMatchObject({ to: 'login', exposeContent: false })
  })

  it('[NAV-STFSUP-13] 공통 복원 — 문의 티켓함만 분할 예외, 나머지는 전체화면 필터·스크롤 복원(저장 범위는 확인 필요)', () => {
    expect(resolveStfsupNav({ from: 'inbox', restoreKey: 'inbox:new:s40' }, { type: 'back' })).toMatchObject({
      split: true, restore: 'inbox:new:s40',
    })
    const chatlog = resolveStfsupNav({ from: 'chatlog', restoreKey: 'chatlog:web:s120' }, { type: 'back' })
    expect(chatlog).toMatchObject({ fullscreen: true, restore: 'chatlog:web:s120' })
    expect(chatlog.persistenceContract).toBe('unknown')
  })

  it('[NAV-STFSUP-14] 티켓 상세 [캘린더에서 예약 처리]는 캘린더로 갔다가 저장 후 문의함 맥락을 복원하고 두 번째 패널·전체 대화를 복제하지 않는다', () => {
    const r = resolveStfsupNav({ from: 'inbox-detail', appointmentId: 'a1', restoreKey: 'inbox:t1:draft' }, { type: 'processInCalendar' })
    expect(r).toMatchObject({ to: 'calendar', selectAppointment: 'a1', singlePanel: true, restoreAfterSave: 'inbox:t1:draft' })
    expect(r).not.toHaveProperty('duplicateConversation')
  })

  it('[NAV-STFSUP-13b] restoreContext는 저장 위치·만료를 발명하지 않고 unknown으로 노출한다', () => {
    expect(restoreContext('chatlog:web:s120')).toEqual({ key: 'chatlog:web:s120', persistenceContract: 'unknown' })
  })
})
