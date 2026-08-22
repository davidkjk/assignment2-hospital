import { useNavigate } from 'react-router-dom'
import { Sparkles } from '@/components/icons'

// 아직 안 지은 화면 — 막다른 길을 만들지 않는다(해결 경로를 함께 준다).
// 척추(로그인→오늘현황→대기목록→접수→환자상세)가 끝나면 이 자리가 실제 화면으로 바뀐다.
export function StaffPlaceholder({ title }: { title: string }) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-muted-foreground">이 화면은 데모에서 곧 이어 만듭니다.</p>
      <button
        onClick={() => navigate('/staff/today')}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
      >
        오늘의 현황으로
      </button>
    </div>
  )
}
