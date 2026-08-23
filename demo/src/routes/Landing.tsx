import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  ChevronRight,
  Hospital,
  MessageCircle,
  Stethoscope,
} from '@/components/icons'

// 데모 전달용 현관(랜딩 허브). 고객 병원이 URL을 열면 여기서 환자 앱·직원 웹·상담봇으로
// 갈라져 들어간다. 병원 브랜드 목소리를 앞세우고, 개발/데모 안내는 작게 둔다.
const ENTRIES = [
  {
    icon: CalendarDays,
    name: '환자 모바일 앱',
    tag: '환자용',
    desc: '예약·가족 관리·방문 이력·AI 상담을 한 곳에서.',
    to: '/app',
    cta: '앱 둘러보기',
  },
  {
    icon: Stethoscope,
    name: '직원·관리자 웹',
    tag: '병원 내부용',
    desc: '오늘 현황·대기 목록·접수·진료 캘린더·상담봇 관리.',
    to: '/staff/login',
    cta: '직원 웹 열기',
  },
  {
    icon: MessageCircle,
    name: '병원 홈페이지 + AI 상담봇',
    tag: '방문 전 안내',
    desc: '홈페이지에 붙는 웹 상담창으로 진료과·예약을 안내.',
    to: '/site',
    cta: '홈페이지 보기',
  },
] as const

export function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        {/* 히어로 — 병원 브랜드 목소리 */}
        <div className="flex flex-col items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md">
            <Hospital className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="text-xs font-bold uppercase tracking-widest text-primary/70">
            예약·상담 시스템 데모
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">가온병원</h1>
          <p className="text-xl font-semibold text-primary">가까운 곳에서, 믿을 수 있는 진료</p>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
            환자 앱 · 직원 웹 · AI 상담봇 세 가지를 아래에서 바로 둘러보실 수 있어요.
          </p>
        </div>

        {/* 세 진입 카드 */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {ENTRIES.map((e) => (
            <button
              key={e.name}
              type="button"
              onClick={() => navigate(e.to)}
              className="group flex flex-col rounded-2xl bg-card p-5 text-left shadow-(--elevation-card) transition-transform hover:-translate-y-0.5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <e.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {e.tag}
              </span>
              <h2 className="mt-0.5 text-lg font-bold leading-snug">{e.name}</h2>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">{e.desc}</p>
              <span className="mt-4 flex items-center gap-1 text-sm font-bold text-primary">
                {e.cta}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>

        {/* 데모 안내 */}
        <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
          이 화면들은 <b className="font-semibold text-foreground">가짜 데이터로 동작하는 시연용</b>이에요.
          실제 환자 정보·진료 기록이 아니며, 로그인·결제 등은 실제로 처리되지 않습니다.
        </p>

        <footer className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          가온병원 예약·상담 시스템 — 외주 개발 데모
        </footer>
      </div>
    </div>
  )
}
