import { useState } from 'react'
import { ChevronDown, LockKeyhole, UserRound } from '@/components/icons'
import { ROLE_LABEL, type StaffProfile } from '../auth/roles'
import { ChangePasswordPanel } from './ChangePasswordPanel'

// 역할 칩 → 계정 메뉴(SHELL-HDR-02·SHELL-ME-01~03). 시각은 데모 `StaffShell.tsx`의 RoleMenu.
// 역할은 항상 보인다 — 관리자가 접수 업무를 볼 때 권한 착각을 막는다(SHELL-HDR-02).
export function AccountMenu({ staff, onPasswordChanged }: { staff: StaffProfile; onPasswordChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm hover:bg-muted/70"
      >
        <UserRound className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{staff.name}</span>
        <span className="text-muted-foreground">· {ROLE_LABEL[staff.role]}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          {/* 바깥을 누르면 닫힌다 — 메뉴는 정보 조회일 뿐이라 잃을 입력이 없다(패널과 다르다) */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-2 w-64 rounded-xl bg-card p-3 text-sm shadow-[var(--shadow-card)]">
            <div className="px-1 pb-2 text-[0.7rem] font-semibold text-muted-foreground">내 정보</div>
            <dl className="space-y-1.5 px-1">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">이메일</dt>
                <dd className="truncate">{staff.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">진료과</dt>
                <dd>{staff.departmentName ?? '해당 없음'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">역할</dt>
                <dd>{ROLE_LABEL[staff.role]}</dd>
              </div>
            </dl>
            <button
              type="button"
              role="menuitem"
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left hover:bg-muted"
              onClick={() => {
                setOpen(false)
                setPanelOpen(true)
              }}
            >
              <LockKeyhole className="h-4 w-4 text-primary" />
              비밀번호 변경
              <span className="ml-auto text-muted-foreground">›</span>
            </button>
          </div>
        </>
      )}
      {panelOpen && (
        <ChangePasswordPanel
          onClose={() => setPanelOpen(false)}
          onDone={() => {
            setPanelOpen(false)
            onPasswordChanged()
          }}
        />
      )}
    </div>
  )
}
