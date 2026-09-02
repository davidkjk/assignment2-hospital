import { useState } from 'react'
import { FileText } from '../../../components/icons'
import { StaffPage, btnPrimary } from '../../../components/staff-ui'
import { kbAdminApi, type KbAdminApi } from '../../../api/kbAdmin'
import { KbList } from './KbList'
import { KbEditor } from './KbEditor'
import { KbHistory } from './KbHistory'
import { useKbList } from './useKbList'
import { KB_CATEGORIES } from './constants'

// 병원 안내자료 관리(/bot/knowledge · 관리자 전용) — 데모 좌목록·우편집 레이아웃에 실 계약을 배선한다.
// 상단 줄=필터 + [새 안내자료](화면 제목은 셸 헤더가 진다, E-9·F-7). 왼쪽=목록, 오른쪽=편집/승인 또는 수정이력.
// 저장만으로 공개되지 않고 승인해야 반영된다.

type View =
  | { k: 'empty' }
  | { k: 'edit'; id: string; prefill?: { title: string; content: string } }
  | { k: 'history'; id: string }

export function KbPage({ api = kbAdminApi }: { api?: KbAdminApi }) {
  const list = useKbList(api)
  const [view, setView] = useState<View>({ k: 'empty' })
  const [creating, setCreating] = useState(false)

  const selId = view.k === 'edit' || view.k === 'history' ? view.id : null
  const selTitle = selId ? list.docs.find((d) => d.id === selId)?.title : undefined

  const onNew = () => {
    setCreating(true)
    api
      .createDoc({ title: '', content: '', category: KB_CATEGORIES[0], isRestricted: false })
      .then((doc) => {
        list.retry() // 새 초안을 목록에 반영
        setView({ k: 'edit', id: doc.id })
      })
      .finally(() => setCreating(false))
  }

  return (
    <StaffPage max="max-w-full" testid="bot-knowledge" footer={false}>
      {/* 2열 그리드: 1행=필터 줄(두 열 걸침), 2행=목록 카드 | 편집기 — 카드 윗선이 맞는다(F-8) */}
      <div className="grid grid-cols-[24rem_1fr] grid-rows-[auto_1fr] gap-x-4" style={{ height: 'calc(100vh - 9rem)' }}>
        <KbList
          className="row-start-2 col-start-1 h-full"
          docs={list.docs}
          phase={list.phase}
          filters={list.filters}
          onFilter={list.setFilter}
          onOpen={({ id }) => setView({ k: 'edit', id })}
          onRetry={list.retry}
          statusContract={list.statusContract}
          selectedId={selId}
          actions={
            <button className={`${btnPrimary} disabled:opacity-50`} disabled={creating} onClick={onNew}>
              <FileText className="h-4 w-4" /> {creating ? '만드는 중…' : '새 안내자료'}
            </button>
          }
        />

        <div className="row-start-2 col-start-2 min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(16,45,50,0.04)]">
          {view.k === 'empty' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">왼쪽에서 자료를 고르거나 [새 안내자료]로 시작하세요</p>
            </div>
          )}
          {view.k === 'edit' && (
            <KbEditor
              key={`${view.id}${view.prefill ? ':rev' : ''}`}
              api={api}
              docId={view.id}
              prefill={view.prefill}
              onGotoRevision={(id) => setView({ k: 'history', id })}
            />
          )}
          {view.k === 'history' && (
            <KbHistory
              api={api}
              docId={view.id}
              docTitle={selTitle}
              onBack={() => setView({ k: 'edit', id: view.id })}
              onEditRevision={(t) => setView({ k: 'edit', id: view.id, prefill: { title: t.title, content: t.content } })}
              onBackToList={() => setView({ k: 'empty' })}
            />
          )}
        </div>
      </div>
    </StaffPage>
  )
}
