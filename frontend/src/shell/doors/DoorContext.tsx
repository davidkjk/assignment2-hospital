import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hospitalToday } from '../../lib/clock'
import { usePanel } from '../../components/PanelHost'
import { type DoctorLite, type DoorId, type FieldId, type PatientLite } from './doorData'

// 세 문의 상태 한 곳. 헤더 버튼이 문을 열고(`SHELL-ACT-04`), 패널의 칸이 왼쪽을 정한다(`PANEL-WORK-01`).
// 패널은 언제나 하나(`PANEL-ONE-01`) · ✕ 닫기는 묻지 않고 다 날린다(`PANEL-LIVE-06`).
//
// ⚠️ 데모의 문 이름 'reserve'는 실에선 'appointment'다 — 헤더 세 버튼(`START_DOORS`)과 같은 이름을 쓴다.

export interface Draft {
  patient?: PatientLite
  isNew?: boolean // 등록: 새 환자로 저장할지
  doctor?: DoctorLite
  date?: string // 'YYYY-MM-DD'
  time?: string // 'HH:MM'
  reason?: string
  /** 접수: 예약 확인(QR·번호) / 예약 없이 오신 분(당일 방문) */
  checkinMode?: 'reserved' | 'walkin'
  walkInWhen?: 'now' | 'past'
}

type Flash = { door: DoorId; text: string } | null

interface DoorApi {
  openDoor: DoorId | null
  collapsed: boolean
  activeField: FieldId
  draft: Draft
  flash: Flash
  open: (door: DoorId) => void
  close: () => void // ✕ 닫기 — 채운 것 사라짐
  finish: (text: string) => void // 저장 완료 → 출발 화면 복귀(`PANEL-HOME-01`) + 성공 알림
  clearFlash: () => void
  toggleCollapse: () => void
  setField: (f: FieldId) => void
  patch: (d: Partial<Draft>) => void
  pickPatient: (p: PatientLite) => void
  pickDoctor: (d: DoctorLite) => void
  pickSlot: (date: string, time: string) => void
  /** 캘린더 빈칸에서 바로 예약 문을 연다 — 의사·날짜(·시각)를 프리필하고 **시각 칸을 켠 채로** 연다.
   *  ⭐ 시각 칸이 켜져 있으면 왼쪽이 그 의사의 일간 캘린더라, 다른 시각을 눌러 바로 바꿀 수 있다(지적 2).
   *  이미 예약 문이 열려 있으면 draft를 지우지 않고 자리(의사·날짜·시각)만 바꾼다(환자·사유 보존). */
  openBookingAt: (doctor: DoctorLite, date: string, time?: string) => void
  /** 문 사이 이어가기 — 지금 환자를 안고 다른 문으로 (F-4: 문 둘·손 하나) */
  switchDoor: (door: DoorId) => void
}

const Ctx = createContext<DoorApi | null>(null)

export function DoorProvider({ children }: { children: ReactNode }) {
  const [openDoor, setOpenDoor] = useState<DoorId | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [activeField, setActiveField] = useState<FieldId>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [flash, setFlash] = useState<Flash>(null)

  // 그릇은 둘이되(세 문=`DoorRegion`, 소비 화면=`PanelHost`) **한 몸처럼 보인다**(2026-08-31 손검수 ③ A안).
  //    `PANEL-ONE-01`(패널은 언제나 하나)을 지키려고 서로 열릴 때 상대를 닫고, 이제 **둘 다 헤더 아래 같은 행에
  //    인라인**으로 앉아 폭(380)·왼쪽 실선·그림자 없음까지 같다(PanelHost가 옛 오버레이·320px를 버리고 도어에 맞춤).
  //    S1 해소 경과: 캘린더 「새 예약」은 헤더 예약 문(`openBookingAt`)으로 통합(CAL-SLOT-06·CAL-BOOK-01);
  //    안내 보내기는 본화면 2단으로 이동(SEND-BOX-01·03); 나머지 패널(예약 상세·안 닿은 명단·전화번호 변경·
  //    당일 방문·진료문구·가족 연결)은 그릇은 PanelHost로 두되 **UI를 도어와 통일**(A안). 가족 연결의 진짜 2단은
  //    서버(배포 Task 7E) 이후 안내 보내기처럼 만든다.
  const { panel, closePanel } = usePanel()

  const api = useMemo<DoorApi>(() => {
    const reset = () => {
      setOpenDoor(null)
      setCollapsed(false)
      setActiveField(null)
      setDraft({})
    }
    return {
      openDoor,
      collapsed,
      activeField,
      draft,
      flash,
      open: (door) => {
        closePanel() // PANEL-ONE-01 — 소비 화면 패널이 열려 있었다면 자리를 다투지 않고 넘겨받는다
        setOpenDoor(door)
        setCollapsed(false)
        // [CAL-BOOK-03] 예약 문의 **날짜 기본값은 오늘**이다 — 비워 두면 의사를 고른 순간
        // 왼쪽 일간 캘린더가 그릴 날이 없다.
        setDraft(
          door === 'checkin'
            ? { checkinMode: 'reserved' }
            : door === 'appointment'
              ? { date: hospitalToday() }
              : {},
        )
        // 예약은 반드시 환자를 골라야 하므로 열자마자 환자 검색(`SHELL-ACT-04`).
        // 등록·접수는 검색을 강요하지 않는다 — 왼쪽은 보던 화면 그대로, 필요할 때만 칸을 눌러 검색.
        setActiveField(door === 'appointment' ? 'patient' : null)
      },
      close: reset,
      finish: (text) => {
        setFlash({ door: openDoor ?? 'appointment', text })
        reset()
      },
      clearFlash: () => setFlash(null),
      toggleCollapse: () => setCollapsed((v) => !v),
      setField: (f) => setActiveField(f),
      patch: (d) => setDraft((prev) => ({ ...prev, ...d })),
      pickPatient: (p) => {
        setDraft((prev) => ({ ...prev, patient: p, isNew: false }))
        // 예약·접수는 다음이 의사, 등록은 기존 환자를 골랐으니 폼을 접고 이음 화면으로.
        // ⭐ 단 캘린더 빈칸에서 자리(의사·날짜·시각)까지 잡고 들어온 예약이면 의사를 다시 묻지 않고
        //    바로 요약(저장)으로 간다 — 남은 칸은 환자뿐이었으므로(2026-08-31 헤더 예약 통합).
        const bookingPrefilled = openDoor === 'appointment' && !!draft.doctor && !!draft.date && !!draft.time
        setActiveField(openDoor === 'register' || bookingPrefilled ? null : 'doctor')
      },
      pickDoctor: (d) => {
        setDraft((prev) => ({ ...prev, doctor: d }))
        // 예약은 다음이 날짜(왼쪽=작은 달력) — 의사를 고르면 먼저 날짜를 고르고, 날짜를 고른 뒤
        //   그 날 일간 캘린더에서 시각을 찍는다(사용자 지시 2026-08-30, PANEL-WORK-02·SHELL-DOOR-02 개정).
        //   접수 당일방문은 시각=지금이라 도구가 필요 없다.
        setActiveField(openDoor === 'appointment' ? 'date' : null)
      },
      pickSlot: (date, time) => {
        setDraft((prev) => ({ ...prev, date, time }))
        setActiveField(null)
      },
      openBookingAt: (doctor, date, time) => {
        if (openDoor === 'appointment') {
          // 이미 예약 문이 열려 있다 — 다른 자리를 눌렀으니 채운 환자·사유는 지키고 자리만 바꾼다.
          setDraft((prev) => ({ ...prev, doctor, date, time }))
        } else {
          closePanel() // 소비 화면 패널이 열려 있었으면 자리를 다투지 않고 넘겨받는다(PANEL-ONE-01)
          setOpenDoor('appointment')
          setCollapsed(false)
          setDraft({ doctor, date, time })
        }
        // 시각 칸을 켠 채로 — 왼쪽이 그 의사의 일간 캘린더가 되어 다른 시각을 눌러 바로 바꿀 수 있다.
        setActiveField('time')
      },
      switchDoor: (door) => {
        const p = draft.patient
        setOpenDoor(door)
        setCollapsed(false)
        if (door === 'appointment') {
          setDraft({ patient: p, date: hospitalToday() })
          setActiveField('doctor') // 환자는 있으니 다음은 의사
        } else if (door === 'checkin') {
          setDraft({ patient: p, checkinMode: 'walkin' })
          setActiveField('doctor')
        } else {
          setDraft({ patient: p })
          setActiveField(null)
        }
      },
    }
  }, [openDoor, collapsed, activeField, draft, flash, closePanel])

  // 반대 방향 — 소비 화면이 패널을 열면 열려 있던 문이 자리를 비운다(`PANEL-ONE-01`).
  const closeDoor = useRef(api.close)
  closeDoor.current = api.close
  useEffect(() => {
    if (panel) closeDoor.current()
  }, [panel])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useDoors(): DoorApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDoors는 <DoorProvider> 안에서만 쓸 수 있습니다.')
  return v
}
