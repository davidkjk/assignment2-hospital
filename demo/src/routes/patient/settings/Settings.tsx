import { useState } from 'react'
import { Bell, ChevronRight, Hospital, LogOut, Settings2, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { accountSnapshot, settingsItems } from './mockData'

export function Settings() {
  const navigate = useNavigate()
  const [loggedOut, setLoggedOut] = useState(false)

  if (loggedOut) {
    return (
      <PhoneFrame>
        <div data-testid="settings" className="flex h-full flex-col">
          <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
            <LogOut className="h-8 w-8 text-primary" />
            <h1 className="text-lg font-bold">로그아웃했어요</h1>
            <Button onClick={() => navigate('/')}>로그인 화면으로</Button>
          </main>
        </div>
      </PhoneFrame>
    )
  }

  const notificationItem = settingsItems.find((item) => item.id === 'notifications')
  const passwordItem = settingsItems.find((item) => item.id === 'password')
  const hospitalItem = settingsItems.find((item) => item.id === 'hospital')
  const withdrawItem = settingsItems.find((item) => item.id === 'withdraw')

  return (
    <PhoneFrame>
      <div data-testid="settings" className="flex h-full flex-col">
        <ScreenHeader title="설정" onBack={() => navigate('/home')} />

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <section aria-labelledby="account-heading" className="mb-5 space-y-2">
            <h2 id="account-heading" className="text-sm font-semibold text-muted-foreground">
              내 정보
            </h2>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <UserRound className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="font-medium">{accountSnapshot.name}</p>
                  <p className="text-sm text-muted-foreground">{accountSnapshot.phone}</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="notification-heading" className="mb-5 space-y-2">
            <h2 id="notification-heading" className="text-sm font-semibold text-muted-foreground">
              알림
            </h2>
            {notificationItem && (
              <SettingsLink
                icon={<Bell className="h-5 w-5" />}
                label={notificationItem.label}
                description={notificationItem.description}
                onClick={() => navigate(notificationItem.path)}
              />
            )}
          </section>

          <section aria-labelledby="account-settings-heading" className="mb-5 space-y-2">
            <h2 id="account-settings-heading" className="text-sm font-semibold text-muted-foreground">
              계정
            </h2>
            {passwordItem && (
              <SettingsLink
                icon={<Settings2 className="h-5 w-5" />}
                label={passwordItem.label}
                description={passwordItem.description}
                onClick={() => navigate(passwordItem.path)}
              />
            )}
            {/* '가족 관리'는 하단 '가족' 탭이 담당(SET-HOME-07: 설정에 수정 문을 따로 만들지 않는다) → 중복 제거 */}
          </section>

          <section aria-labelledby="hospital-heading" className="mb-5 space-y-2">
            <h2 id="hospital-heading" className="text-sm font-semibold text-muted-foreground">
              병원
            </h2>
            {hospitalItem && (
              <SettingsLink
                icon={<Hospital className="h-5 w-5" />}
                label="한빛병원"
                description="02-1234-5678 · 강남구"
                onClick={() => navigate(hospitalItem.path)}
              />
            )}
          </section>

          <section className="space-y-3">
            <Button variant="outline" className="w-full" onClick={() => setLoggedOut(true)}>
              <LogOut className="mr-2 h-4 w-4 text-primary" /> 로그아웃
            </Button>
            {withdrawItem && (
              <button
                type="button"
                onClick={() => navigate(withdrawItem.path)}
                className="flex w-full items-center justify-center gap-1 py-2 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {withdrawItem.label}
                <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </section>
        </main>
      </div>
    </PhoneFrame>
  )
}

function SettingsLink({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <span className="text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label} <span className="text-primary">›</span></span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
