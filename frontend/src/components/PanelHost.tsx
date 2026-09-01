import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, Pencil } from './icons'

// ⭐ 패널은 자리가 아니라 상태다 — **앱 전체에 하나**(`PANEL-ONE-01`). 오른쪽에서 열리면 「만드는 중」.
// 직원이 배우는 규칙 한 줄: *오른쪽에서 열리면 「만드는 중」, 가운데서 막아서면 「확인해야 넘어감」.*
//
// 이 파일이 소유하는 것: 하나뿐인 그릇 · 접기(잠깐 치우기)/닫기(그만두기)의 구분 · 접어도 채운 것이 삶 ·
//   출발지(origin) 기억. ⛔ **패널 안의 내용**(워크인 폼·전화예약 폼·예약 상세)과 **왼쪽 화면**(검색 표·
//   캘린더)은 소비 화면(Task 9·14·24)이 채운다 — 여기서는 content로 받아 담기만 한다.
//
// 접기/닫기의 손맛이 갈리는 이유: ✕는 그만두기라 채운 것이 사라진다 — 대신 묻지 않는다.
//   «접기는 잠깐 치우기라 왼쪽이 넓어지되 작성 중이라는 사실이 얇은 띠로 화면에 남는다(`PANEL-LIVE-*`).
//   ⚠️ 접혔다 펴도 채운 것이 살아 있어야 하므로, 접힌 동안에도 본 패널을 **떼지 않고 감추기만** 한다.

export interface PanelSpec {
  /** 얇은 띠·헤더에 쓰는 이름. 예: "김민정 님 예약" → 띠는 "김민정 님 예약 작성 중". */
  title: string
  /** 담을 내용 — 소비 화면이 만든다. */
  content: ReactNode
  /** 저장 뒤 돌아갈 출발 화면(`PANEL-HOME-*`). 라우팅은 소비 화면이 한다. */
  origin?: string
}

interface PanelContextValue {
  panel: PanelSpec | null
  collapsed: boolean
  openPanel: (spec: PanelSpec) => void
  collapsePanel: () => void
  expandPanel: () => void
  closePanel: () => void
}

const PanelContext = createContext<PanelContextValue | null>(null)

export function PanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<PanelSpec | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const value = useMemo<PanelContextValue>(
    () => ({
      panel,
      collapsed,
      // 접힌 채로 다른 패널을 열면 접힌 상태를 유지한 채 내용만 바뀐다(PANEL-LIVE-07·08).
      // 접혀 있지 않으면 그대로 펼친 채 새 내용을 연다. 어느 쪽이든 「하나」는 지켜진다.
      openPanel: (spec) => setPanel(spec),
      collapsePanel: () => setCollapsed(true),
      expandPanel: () => setCollapsed(false),
      closePanel: () => {
        setPanel(null)
        setCollapsed(false)
      },
    }),
    [panel, collapsed],
  )

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanel(): PanelContextValue {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel은 <PanelProvider> 안에서만 쓸 수 있습니다.')
  return ctx
}

// ⭐ 도어(등록·접수·예약) 패널과 같은 껍데기로 통일한다(2026-08-31 손검수 ③ A안) — 헤더 아래 같은 행에
//   인라인으로 앉아 헤더 폭을 줄이지 않고(옛 오버레이·그림자·320px 폐기), 폭 380·왼쪽 실선·그림자 없음으로
//   도어와 결을 맞춘다. 접기/닫기 글자(»접기·✕ 닫기)와 접힘 띠의 「작성 중」 계약은 그대로 지킨다(PANEL-LIVE-*).
export function PanelHost() {
  const { panel, collapsed, expandPanel, collapsePanel, closePanel } = usePanel()
  if (!panel) return null

  return (
    <>
      {collapsed && (
        // 세로 띠 — 작성 중이라는 사실이 화면에 남는다(도어 접힘 띠와 같은 결). 눌러서 다시 펼친다.
        <aside
          role="complementary"
          aria-label="작성 중인 패널"
          className="flex w-11 shrink-0 flex-col border-l border-border bg-card"
        >
          <button
            type="button"
            onClick={expandPanel}
            className="flex flex-1 flex-col items-center gap-2 py-4 text-primary hover:bg-muted"
          >
            <Pencil className="h-4 w-4" />
            <span className="text-xs font-medium text-muted-foreground" style={{ writingMode: 'vertical-rl' }}>
              {panel.title} 작성 중
            </span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        </aside>
      )}
      {/* 본 패널은 접혔을 때도 떼지 않고 감추기만 한다 — 채운 것(입력값)이 살아 있어야 하기 때문.
          hidden 속성(트리 제외) + Tailwind hidden 클래스(실 브라우저 display:none) 둘 다 건다. */}
      <aside
        role="complementary"
        aria-label="패널"
        hidden={collapsed}
        className={collapsed ? 'hidden' : 'flex w-[380px] max-w-[42vw] shrink-0 flex-col border-l border-border bg-card'}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">{panel.title}</h2>
          </div>
          {/* 접기 ≠ 닫기 — 글자로 구분(PANEL-LIVE-05). ✕는 채운 것이 사라지고 묻지 않는다(PANEL-LIVE-06). */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={collapsePanel}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              »접기
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              ✕ 닫기
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{panel.content}</div>
      </aside>
    </>
  )
}
