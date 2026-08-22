import { useState, type FormEvent } from 'react'
import { AlertTriangle, ShieldCheck } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { withdrawalPolicy } from './mockData'

export function Withdraw() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [reauthenticated, setReauthenticated] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [withdrawn, setWithdrawn] = useState(false)

  const reauthenticate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password.trim()) setReauthenticated(true)
  }

  return (
    <PhoneFrame>
      <div data-testid="settings-withdraw" className="flex h-full flex-col">
        <ScreenHeader title="회원 탈퇴" onBack={() => navigate('/settings')} />

        <main className="flex-1 overflow-y-auto px-5 py-5">
          {withdrawn ? (
            <div className="flex flex-col items-center gap-4 py-20 text-center">
              <ShieldCheck className="h-8 w-8 text-primary" />
              <h2 className="text-lg font-bold">탈퇴가 완료됐어요</h2>
              <p className="text-sm text-muted-foreground">{withdrawalPolicy.archiveNotice}</p>
              <Button onClick={() => navigate('/')}>로그인 화면으로</Button>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-2">
                <h2 className="text-base font-bold">탈퇴 전 본인 확인</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  민감한 계정 작업이라 비밀번호를 다시 확인합니다.
                </p>
                <form onSubmit={reauthenticate} className="space-y-3 rounded-xl border bg-card p-4">
                  <Label htmlFor="withdraw-password">비밀번호</Label>
                  <Input
                    id="withdraw-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={reauthenticated}
                  />
                  <Button type="submit" variant="outline" disabled={reauthenticated || !password.trim()}>
                    {reauthenticated ? '본인 확인을 마쳤어요' : '본인 확인'}
                  </Button>
                </form>
              </section>

              {reauthenticated && withdrawalPolicy.hasUpcomingAppointments ? (
                <section className="space-y-3 rounded-xl border bg-primary/5 p-4" role="alert">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="space-y-2">
                      <h2 className="font-bold">현재 탈퇴하실 수 없습니다</h2>
                      <p className="text-sm leading-6 text-muted-foreground">
                        진행 중인 예약이 있어 예약을 먼저 마친 뒤 탈퇴할 수 있습니다. 예약을 취소하거나 진료를 마친 뒤 다시 시도해 주세요.
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">{withdrawalPolicy.archiveNotice}</p>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => navigate('/appointments')}>
                    예약 확인하기
                  </Button>
                </section>
              ) : (
                reauthenticated && (
                  <section className="space-y-3 rounded-xl border bg-card p-4">
                    <h2 className="font-bold">탈퇴 안내</h2>
                    <p className="text-sm leading-6 text-muted-foreground">{withdrawalPolicy.archiveNotice}</p>
                    <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                      회원 탈퇴
                    </Button>
                  </section>
                )
              )}
            </div>
          )}
        </main>

        {confirmOpen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-foreground/20 p-5">
            <div role="dialog" aria-modal="true" aria-labelledby="withdraw-confirm-heading" className="w-full rounded-2xl border bg-background p-5 shadow-xl">
              <h2 id="withdraw-confirm-heading" className="text-base font-bold">정말 탈퇴하시겠어요?</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                탈퇴 후에는 계정으로 다시 로그인할 수 없습니다. {withdrawalPolicy.archiveNotice}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  닫기
                </Button>
                <Button variant="destructive" onClick={() => { setConfirmOpen(false); setWithdrawn(true) }}>
                  탈퇴하기
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
