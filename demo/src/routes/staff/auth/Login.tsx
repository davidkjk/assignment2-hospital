import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Hospital } from '@/components/icons'
import { DEMO_ACCOUNTS, ROLE_LABEL } from '../mockData'
import { useStaff } from '../staffState'

// 직원 전용 이메일·비밀번호 로그인 (STAFF-LOGIN-*). 환자용 전화번호 로그인과 분리.
// 역할 선택 칸·회원가입 없음. 실패는 계정 존재를 숨기는 한 문장(STAFF-LOGIN-07).
// 데모: 비밀번호는 검증만(비어있지 않으면 통과), 이메일로 역할을 매핑한다.
export function StaffLogin() {
  const navigate = useNavigate()
  const { login } = useStaff()
  const [email, setEmail] = useState('admin@gaon.kr')
  const [pw, setPw] = useState('demo1234')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function submit() {
    setErr('')
    if (!email.trim() || !pw.trim()) {
      setErr('이메일과 비밀번호를 입력해 주세요')
      return
    }
    const account = DEMO_ACCOUNTS[email.trim().toLowerCase()]
    if (!account) {
      // 개인정보 열거 방지 — 원인을 나누지 않는 한 문장 (STAFF-LOGIN-07)
      setErr('로그인 정보를 확인해 주세요')
      setPw('')
      return
    }
    setBusy(true)
    // 데모라 실제 인증 없이 짧게 대기 후 이동
    setTimeout(() => {
      login(account)
      navigate(account.role === 'doctor' ? '/staff/doctor/console' : '/staff/today')
    }, 350)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Hospital className="h-7 w-7" />
          </div>
          <h1 className="brand-wordmark text-2xl text-primary">가온병원</h1>
          <p className="text-sm text-muted-foreground">직원 업무 시스템</p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-6 shadow-[0_1px_3px_rgba(16,45,50,0.06)]">
          <h2 className="mb-5 text-lg font-bold">직원 로그인</h2>

          <label className="mb-1 block text-sm font-medium">업무용 이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="name@gaon.kr"
            className="mb-3 w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
          />

          <label className="mb-1 block text-sm font-medium">비밀번호</label>
          <div className="relative mb-1">
            <input
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 pr-10 text-base outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? '비밀번호 가리기' : '비밀번호 보기'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            >
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>

          {/* 실패 문구 — 버튼 바로 위 붙박이 (STAFF-LOGIN-08) */}
          {err && <p className="mb-2 mt-2 text-sm font-medium text-destructive">{err}</p>}

          <button
            onClick={submit}
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-primary py-2.5 text-base font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? '◌ 로그인 중…' : '로그인'}
          </button>

          <button
            type="button"
            className="mt-3 w-full text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            비밀번호 재설정
          </button>
        </div>

        {/* 데모 안내 — 실제 앱엔 없음 */}
        <div className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          <p className="mb-1.5 font-semibold text-foreground/70">데모 계정 (눌러서 채우기 · 비밀번호 아무거나)</p>
          <div className="flex flex-col gap-1">
            {Object.values(DEMO_ACCOUNTS).map((a) => (
              <button
                key={a.email}
                onClick={() => {
                  setEmail(a.email)
                  setPw('demo1234')
                  setErr('')
                }}
                className="flex items-center justify-between rounded-md px-2 py-1 text-left hover:bg-muted"
              >
                <span className="font-medium text-foreground/80">{ROLE_LABEL[a.role]}</span>
                <span>{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
