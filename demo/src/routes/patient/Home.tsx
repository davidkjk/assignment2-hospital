import { PhoneFrame } from '@/components/PhoneFrame'

// Task 4에서 실제 홈으로 채운다. 지금은 라우팅 골격 확인용 placeholder.
export function Home() {
  return (
    <PhoneFrame>
      <div data-testid="home-screen" className="p-6">
        <h1 className="text-xl font-bold">홈</h1>
      </div>
    </PhoneFrame>
  )
}
