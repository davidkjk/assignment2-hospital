import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

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

export function PanelHost() {
  const { panel, collapsed, expandPanel, collapsePanel, closePanel } = usePanel()
  if (!panel) return null

  return (
    <>
      {collapsed && (
        // 얇은 띠 — 작성 중이라는 사실이 화면에 남는다. 눌러서 다시 펼친다.
        <aside role="complementary" aria-label="작성 중인 패널" style={styles.strip}>
          <button type="button" onClick={expandPanel} style={styles.stripBtn}>
            {panel.title} 작성 중
          </button>
        </aside>
      )}
      {/* 본 패널은 접혔을 때도 떼지 않고 감추기만 한다 — 채운 것(입력값)이 살아 있어야 하기 때문. */}
      <aside
        role="complementary"
        aria-label="패널"
        hidden={collapsed}
        style={collapsed ? { display: 'none' } : styles.panel}
      >
        <header style={styles.header}>
          <span style={styles.title}>{panel.title}</span>
          <span style={styles.headerBtns}>
            <button type="button" onClick={collapsePanel} style={styles.ghost}>«접기</button>
            <button type="button" onClick={closePanel} style={styles.ghost}>✕ 닫기</button>
          </span>
        </header>
        <div style={styles.body}>{panel.content}</div>
      </aside>
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    width: 320,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-surface)',
    borderLeft: '1px solid var(--color-divider)',
    boxShadow: '-2px 0 8px rgba(16,36,58,.06)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 12px',
    borderBottom: '1px solid var(--color-divider)',
  },
  title: { fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--color-ink)' },
  headerBtns: { display: 'flex', gap: 4 },
  ghost: {
    height: 26,
    padding: '0 8px',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  body: { padding: 12, overflow: 'auto', flex: 1 },
  strip: {
    display: 'flex',
    background: 'var(--color-primary-wash)',
    borderLeft: '3px solid var(--color-primary)',
  },
  stripBtn: {
    flex: 1,
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 700,
    textAlign: 'left',
    cursor: 'pointer',
  },
}
