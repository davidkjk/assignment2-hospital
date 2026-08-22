import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, History, Pencil } from '@/components/icons'
import { PageHead, Panel, Segmented, StaffPage, StatusBadge, Tag, Toolbar, btnGhost, btnLink, btnPrimary } from '../_ui'
import { knowledgeHistory, knowledgeItems, type KnowledgeItem, type KnowledgeStatus } from './mockData'

// 안내자료 관리 — KBADM-LIST/EDITOR/HISTORY. 최상위 testid: bot-knowledge.
type View = 'list' | 'editor' | 'history'
type Filter = '전체' | KnowledgeStatus

const filters: { key: Filter; label: string }[] = [
  { key: '전체', label: '전체' },
  { key: '공개', label: '공개' },
  { key: '검토 중', label: '검토 중' },
  { key: '임시저장', label: '임시저장' },
]

export function Knowledge() {
  const [view, setView] = useState<View>('list')
  const [filter, setFilter] = useState<Filter>('전체')
  const [selected, setSelected] = useState<KnowledgeItem>(knowledgeItems[0])
  const [title, setTitle] = useState(knowledgeItems[0].title)
  const [body, setBody] = useState(knowledgeItems[0].body)
  const [restricted, setRestricted] = useState(Boolean(knowledgeItems[0].restricted))
  const [notice, setNotice] = useState('')
  const [confirming, setConfirming] = useState(false)

  const visible = useMemo(
    () => knowledgeItems.filter((item) => filter === '전체' || item.status === filter),
    [filter],
  )

  const openEditor = (item: KnowledgeItem) => {
    setSelected(item)
    setTitle(item.title)
    setBody(item.body)
    setRestricted(Boolean(item.restricted))
    setNotice('')
    setView('editor')
  }

  const startNew = () => {
    const blank: KnowledgeItem = {
      id: 'new',
      title: '',
      category: '자주 묻는 질문',
      status: '임시저장',
      updatedAt: '방금',
      body: '',
    }
    openEditor(blank)
  }

  if (view === 'history') {
    return (
      <StaffPage testid="bot-knowledge">
        <PageHead title="안내자료 수정이력" sub={`현재 자료 한 건 · ${selected.title}`} action={<button className={btnGhost} onClick={() => setView('editor')}>편집기로 돌아가기</button>} />
        <Panel pad="p-0">
          <div className="divide-y divide-border/60">
            {knowledgeHistory.map((entry) => (
              <div key={entry.id} className="grid gap-3 px-4 py-3 md:grid-cols-[7rem_1fr_auto] md:items-start">
                <div><div className="font-semibold">{entry.version}</div><div className="text-xs text-muted-foreground">{entry.at}</div></div>
                <div><div className="text-sm font-medium">{entry.change}</div><div className="mt-1 text-xs text-muted-foreground">{entry.by} · {entry.body}</div></div>
                <button className={btnLink} onClick={() => { setBody(entry.body); setNotice('이전 내용을 새 수정본으로 불러왔습니다. 확인·수정 후 다시 승인해야 합니다.'); setView('editor') }}><Pencil className="mr-1 inline h-3.5 w-3.5" />이 버전 편집</button>
              </div>
            ))}
          </div>
        </Panel>
      </StaffPage>
    )
  }

  if (view === 'editor') {
    return (
      <StaffPage testid="bot-knowledge" max="max-w-5xl">
        <PageHead title={selected.id === 'new' ? '새 안내자료' : '안내자료 편집'} sub="저장본은 승인되기 전까지 상담봇 답변에 공개되지 않습니다." action={<button className={btnGhost} onClick={() => setView('list')}>목록으로</button>} />
        <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
          <Panel title="자료 내용">
            <label className="block text-xs font-medium text-muted-foreground">제목<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" /></label>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">본문<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} className="mt-1 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/40" /></label>
            <label className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-3 text-sm"><input type="checkbox" checked={restricted} onChange={(event) => setRestricted(event.target.checked)} className="mt-0.5" /><span><span className="font-medium">상담봇이 직접 답변하지 않고 이 문구만 그대로 보여줍니다</span><span className="mt-0.5 block text-xs text-muted-foreground">제한 주제는 별도 안내 블록과 직원 연결 경로만 제공합니다.</span></span></label>
          </Panel>
          <div className="space-y-3">
            <Panel title="공개 상태">
              <StatusBadge status={selected.status} />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">저장해도 현재 공개본은 바뀌지 않습니다. 승인 성공 전까지 기존 승인본을 유지합니다.</p>
            </Panel>
            <Panel title="작업">
              <div className="space-y-2">
                <button className={`${btnGhost} w-full justify-center`} disabled={!title.trim() || !body.trim()} onClick={() => setNotice('승인 전 저장본으로 저장했습니다. 공개된 기존본은 그대로입니다.')}>임시저장</button>
                <button className={`${btnGhost} w-full justify-center`} disabled={!title.trim() || !body.trim()} onClick={() => setNotice('승인 요청을 보냈습니다. 승인 전에는 비공개입니다.')}>승인 요청</button>
                <button className={`${btnPrimary} w-full justify-center`} disabled={!title.trim() || !body.trim()} onClick={() => setConfirming(true)}><CheckCircle2 className="h-4 w-4" />승인</button>
                {selected.id !== 'new' && <button className={`${btnLink} w-full py-2`} onClick={() => setView('history')}><History className="mr-1 inline h-3.5 w-3.5" />수정이력 보기</button>}
              </div>
            </Panel>
          </div>
        </div>
        {notice && <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-primary/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{notice}</div>}
        {confirming && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
            <Panel className="w-full max-w-md" title="안내자료를 승인할까요?">
              <p className="text-sm text-muted-foreground">승인 즉시 상담봇 답변에 반영되며 승인 취소는 제공되지 않습니다. 내용을 다시 확인해 주세요.</p>
              <div className="mt-4 flex justify-end gap-2"><button className={btnGhost} onClick={() => setConfirming(false)}>계속 편집</button><button className={btnPrimary} onClick={() => { setConfirming(false); setNotice('승인되어 AI 상담봇 답변에 반영되었습니다.') }}>확인하고 승인</button></div>
            </Panel>
          </div>
        )}
      </StaffPage>
    )
  }

  return (
    <StaffPage testid="bot-knowledge">
      <PageHead title="병원 안내자료" sub="승인된 병원 자료만 상담봇 답변의 근거로 사용됩니다." action={<button className={btnPrimary} onClick={startNew}><FileText className="h-4 w-4" />새 안내자료</button>} />
      <Toolbar left={<Segmented options={filters} value={filter} onChange={setFilter} count={(key) => key === '전체' ? knowledgeItems.length : knowledgeItems.filter((item) => item.status === key).length} />} right={<div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4" />의사 소개·진료시간은 각 원본에서 관리</div>} />
      <Panel pad="p-0">
        <div className="grid grid-cols-[1fr_9rem_7rem_9rem] gap-3 border-b border-border/70 bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground"><span>제목</span><span>분류</span><span>상태</span><span>수정일</span></div>
        <div className="divide-y divide-border/60">
          {visible.map((item) => <button key={item.id} onClick={() => openEditor(item)} className="grid w-full grid-cols-[1fr_9rem_7rem_9rem] gap-3 px-4 py-3 text-left text-sm hover:bg-muted"><span className="min-w-0 font-medium"><span className="block truncate">{item.title}</span>{item.restricted && <Tag>답변 제한</Tag>}</span><span className="text-muted-foreground">{item.category}</span><span><StatusBadge status={item.status} /></span><span className="text-xs tabular-nums text-muted-foreground">{item.updatedAt}</span></button>)}
        </div>
      </Panel>
    </StaffPage>
  )
}
