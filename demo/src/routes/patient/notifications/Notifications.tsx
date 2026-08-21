import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CalendarCheck2,
  CalendarClock,
  ClipboardList,
  FileText,
  MessageCircle,
  X,
} from 'lucide-react'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import type { NotificationItem, NotificationKind } from './mockData'
import { initialNotifications } from './mockData'

const NOTIFICATION_ICON: Record<NotificationKind, typeof Bell> = {
  booking: CalendarCheck2,
  reminder: CalendarClock,
  change: AlertCircle,
  cancel: AlertCircle,
  questionnaire: ClipboardList,
  chat: MessageCircle,
  aftercare: FileText,
  gone: AlertCircle,
}

function groupNotifications(items: NotificationItem[]) {
  const groups: { label: string; items: NotificationItem[] }[] = []
  for (const item of items) {
    const group = groups.find((candidate) => candidate.label === item.groupLabel)
    if (group) group.items.push(item)
    else groups.push({ label: item.groupLabel, items: [item] })
  }
  return groups
}

export function Notifications() {
  const navigate = useNavigate()
  const [items, setItems] = useState(initialNotifications)
  const [showGoneNotice, setShowGoneNotice] = useState(false)

  // 알림함에 들어온 순간 전부 읽음으로 처리한다(NOTI-READ-04).
  useEffect(() => {
    setItems((current) => current.map((item) => ({ ...item, read: true })))
  }, [])

  const groups = useMemo(() => groupNotifications(items), [items])
  const unreadCount = items.filter((item) => !item.read).length

  const openNotification = (item: NotificationItem) => {
    if (item.target.type === 'gone') {
      setShowGoneNotice(true)
      return
    }
    navigate(item.target.path)
  }

  return (
    <PhoneFrame>
      <div data-testid="notifications" className="flex h-full flex-col bg-background">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <Button variant="ghost" size="icon" aria-label="홈으로" onClick={() => navigate('/home')}>
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">알림함</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">새 알림 {unreadCount}개</p>
            )}
          </div>
          <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          {groups.length === 0 ? (
            <div className="mt-16 text-center">
              <p className="font-semibold">받은 알림이 없습니다</p>
              <p className="mt-2 text-sm text-muted-foreground">
                예약이 확정되거나 변경되면 여기에서 알려드립니다
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.label} aria-labelledby={`notification-group-${group.label}`}>
                  <h2
                    id={`notification-group-${group.label}`}
                    className="mb-2 text-sm font-semibold text-muted-foreground"
                  >
                    {group.label}
                  </h2>
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {group.items.map((item) => {
                      const Icon = NOTIFICATION_ICON[item.kind]
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid="notification-item"
                          data-read={item.read}
                          className={`flex w-full items-start gap-3 border-b px-3 py-3 text-left last:border-b-0 ${
                            item.read
                              ? 'border-l-4 border-l-transparent text-muted-foreground'
                              : item.important
                                ? 'border-l-4 border-l-destructive text-foreground'
                                : 'border-l-4 border-l-primary text-foreground'
                          }`}
                          onClick={() => openNotification(item)}
                        >
                          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 font-semibold">
                              {item.title}
                              {!item.read && <span className="sr-only">새 알림</span>}
                            </span>
                            <span className="mt-1 block truncate text-sm">
                              {item.patientName} · {item.message}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">{item.time}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground">
            알림은 30일 동안 보관됩니다
          </p>

          <button
            type="button"
            onClick={() => navigate('/cards')}
            className="mt-6 w-full rounded-xl border border-dashed py-3 text-center text-xs text-muted-foreground hover:bg-muted"
          >
            (데모) 예약 카드 10종 상태 모음 보기 ›
          </button>
        </main>

        {showGoneNotice && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="gone-notification-title"
              className="w-full rounded-xl border bg-card p-5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="gone-notification-title" className="font-bold">
                    이 예약은 더 이상 볼 수 없습니다
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    예약이 취소되었거나 가족 연결이 해제되었을 수 있습니다
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="닫기"
                  onClick={() => setShowGoneNotice(false)}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <Button className="mt-5 w-full" onClick={() => setShowGoneNotice(false)}>
                닫기
              </Button>
            </div>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
