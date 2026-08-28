import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePanel } from '../../components/PanelHost'
import { TODAY_ISO, type DoctorLite, type DoorId, type FieldId, type PatientLite } from './doorData'

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

  // ⚠️ 그릇이 둘이다 — 세 문은 `DoorRegion`, 소비 화면(캘린더·검색·안내 보내기)은 `PanelHost`.
  //    `PANEL-ONE-01`(패널은 언제나 하나)을 지키려고 서로 열릴 때 상대를 닫는다.
  //    TODO(S1): 두 그릇을 하나로 합칠지 화면 포팅 때 한 번 정한다(계획 §5 이월 항목).
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
        setDraft(door === 'checkin' ? { checkinMode: 'reserved' } : {})
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
        // 예약·접수는 다음이 의사, 등록은 기존 환자를 골랐으니 폼을 접고 이음 화면으로
        setActiveField(openDoor === 'register' ? null : 'doctor')
      },
      pickDoctor: (d) => {
        setDraft((prev) => ({ ...prev, doctor: d }))
        // 예약은 다음이 시간(왼쪽=일간 캘린더). 접수 당일방문은 시각=지금이라 도구가 필요 없다.
        setActiveField(openDoor === 'appointment' ? 'time' : null)
      },
      pickSlot: (date, time) => {
        setDraft((prev) => ({ ...prev, date, time }))
        setActiveField(null)
      },
      switchDoor: (door) => {
        const p = draft.patient
        setOpenDoor(door)
        setCollapsed(false)
        if (door === 'appointment') {
          setDraft({ patient: p, date: TODAY_ISO })
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

export { TODAY_ISO }
