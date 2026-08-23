import { useNavigate } from 'react-router-dom'
import { CalendarClock, Hospital, MapPin, Stethoscope } from '@/components/icons'
import { WebChatWidget } from './WebChatWidget'

// 병원 홈페이지(직원웹·환자앱이 아닌 공개 웹). 요구사항 5.1의 "웹 상담창"이 붙는 자리.
// 데모라 최소한으로만 만든다 — 목적은 "웹에서도 같은 상담봇이 뜬다"를 보이는 것.
export function SiteHome() {
  const navigate = useNavigate()

  const info = [
    {
      icon: Stethoscope,
      title: '진료과 안내',
      body: '내과 · 정형외과 · 이비인후과 · 피부과 · 안과. 어느 과인지 모르겠으면 상담봇이 안내해요.',
    },
    {
      icon: CalendarClock,
      title: '진료시간',
      body: '평일 09:00–18:00 · 토요일 09:00–13:00. 일요일·공휴일 휴진.',
    },
    {
      icon: MapPin,
      title: '오시는 길',
      body: '시청역 2번 출구 도보 5분. 지하 주차장(진료 시 2시간 무료).',
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 상단 바 */}
      <header className="sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Hospital className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-black tracking-tight">가온병원</span>
          <nav className="ml-auto hidden items-center gap-6 text-sm font-semibold text-muted-foreground sm:flex">
            <span>진료과</span>
            <span>진료시간</span>
            <span>오시는 길</span>
          </nav>
          <button
            type="button"
            onClick={() => navigate('/app')}
            className="ml-4 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            앱 열기
          </button>
        </div>
      </header>

      {/* 히어로 */}
      <section className="mx-auto max-w-5xl px-5 pb-12 pt-16">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" /> 예약·진료과 상담 24시간
        </p>
        <h1 className="max-w-2xl text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          가까운 곳에서,
          <br />
          믿을 수 있는 진료.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
          어느 진료과로 가야 할지 모르겠다면, 오른쪽 아래 <b className="font-bold text-primary">AI 상담봇</b>에게
          증상을 말해 보세요. 알맞은 진료과와 예약 방법을 안내해 드려요.
        </p>
      </section>

      {/* 안내 카드 */}
      <section className="mx-auto grid max-w-5xl gap-4 px-5 pb-24 sm:grid-cols-3">
        {info.map((c) => (
          <div key={c.title} className="rounded-2xl bg-card p-5 shadow-(--elevation-card)">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <c.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-lg font-bold">{c.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        가온병원 · 데모 홈페이지 — 실제 병원이 아닙니다
      </footer>

      <WebChatWidget />
    </div>
  )
}
