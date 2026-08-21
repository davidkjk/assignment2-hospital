import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import { notificationGroups } from './mockData'

const initialPreferences = Object.fromEntries(
  notificationGroups.flatMap((group) => group.items.map((item) => [item.id, true])),
)

export function Notifications() {
  const navigate = useNavigate()
  const [enabled, setEnabled] = useState<Record<string, boolean>>(initialPreferences)
  const [importantNoticeSeen, setImportantNoticeSeen] = useState(false)
  const [importantNoticeOpen, setImportantNoticeOpen] = useState(false)

  const toggle = (id: string, important: boolean) => {
    if (important && enabled[id] && !importantNoticeSeen) {
      setImportantNoticeOpen(true)
      return
    }
    setEnabled((current) => ({ ...current, [id]: !current[id] }))
  }

  const keepImportantNotification = () => {
    setImportantNoticeSeen(true)
    setImportantNoticeOpen(false)
  }

  const disableImportantNotification = () => {
    setImportantNoticeSeen(true)
    setEnabled((current) => ({ ...current, 'appointment-changed': false }))
    setImportantNoticeOpen(false)
  }

  return (
    <PhoneFrame>
      <div data-testid="settings-notifications" className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate('/settings')}
            className="-ml-2 rounded-full p-1 hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold">알림 설정</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <p className="mb-5 text-sm text-muted-foreground">알림을 움직이면 바로 저장됩니다.</p>
          <div className="space-y-5">
            {notificationGroups.map((group) => (
              <section key={group.id} aria-labelledby={`${group.id}-heading`} className="space-y-2">
                <h2 id={`${group.id}-heading`} className="text-sm font-semibold text-muted-foreground">
                  {group.title}
                </h2>
                <div className="overflow-hidden rounded-xl border bg-card">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 border-b px-4 py-4 last:border-b-0 ${item.important ? 'border-l-4 border-l-destructive' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium ${item.important ? 'text-destructive' : ''}`}>{item.label}</p>
                        {item.important && (
                          <p className="mt-1 text-xs text-muted-foreground">병원 사정으로 예약이 바뀔 때 알려드립니다.</p>
                        )}
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled[item.id]}
                        aria-label={`${item.label} ${enabled[item.id] ? '켜짐' : '꺼짐'}`}
                        onClick={() => toggle(item.id, item.important)}
                        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${enabled[item.id] ? 'border-primary bg-primary' : 'border-border bg-muted'}`}
                      >
                        <span
                          className={`absolute top-1 h-5 w-5 rounded-full bg-background shadow transition-transform ${enabled[item.id] ? 'translate-x-5' : 'translate-x-1'}`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>

        {importantNoticeOpen && (
          <div className="absolute inset-0 z-10 flex items-end bg-foreground/20 p-4" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="important-notice-heading" className="w-full rounded-2xl border bg-background p-5 shadow-xl">
              <h2 id="important-notice-heading" className="text-base font-bold">중요 알림을 끄시겠어요?</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                병원 사정으로 예약 시간이 바뀌거나 취소될 때 앱에서 알려드릴 수 없습니다. 다만 일정이 바뀌면 병원에서 전화로도 안내드립니다. 연락처가 바뀌셨다면 설정에서 확인해 주세요.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={keepImportantNotification}>
                  그대로 둘게요
                </Button>
                <Button variant="secondary" onClick={disableImportantNotification}>
                  끄기
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
