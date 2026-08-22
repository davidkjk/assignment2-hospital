import { Phone, ShieldCheck } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { ScreenHeader } from '@/components/ScreenHeader'
import { hospitalInfo } from '@/routes/patient/settings/mockData'

const CHECK_STEPS = ['이름·생년월일', '최근 방문일·진료받은 과', '새 번호로 인증번호 발송']

// AUTH-TEL-01~05: 번호 변경은 앱에서 처리하지 않고 병원의 확인 경로만 안내한다.
export function PhoneChangeGuide() {
  const navigate = useNavigate()

  return (
    <PhoneFrame>
      <div data-testid="phone-change-guide" className="flex h-full flex-col">
        <ScreenHeader title="전화번호 변경 안내" onBack={() => navigate('/')} />

        <main className="flex-1 overflow-y-auto px-5 py-6">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold">안전한 계정 보호를 위해 병원에서 확인합니다</span>
          </div>

          <section className="mt-5">
            <h2 className="text-xl font-bold">병원에 방문하시거나 전화해 주세요</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              본인 확인 후 직원이 등록된 전화번호를 바꿔드립니다. 그동안의 예약과 방문 이력은
              그대로 유지됩니다.
            </p>
            <p className="mt-3 rounded-xl bg-muted p-3 text-sm leading-6">
              앱에서는 전화번호를 직접 바꾸지 않고, 병원에서 본인 확인을 거친 뒤 변경합니다.
            </p>
          </section>

          <section className="mt-7">
            <h2 className="text-base font-bold">확인 절차</h2>
            <ol data-testid="phone-change-checklist" className="mt-3 space-y-3">
              {CHECK_STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-3 rounded-xl border p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <a
            href={`tel:${hospitalInfo.phone}`}
            className="mt-7 flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/80"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            병원 전화번호로 문의
          </a>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            방문이 어려우시면 전화로 문의하셔도 됩니다.
          </p>
        </main>
      </div>
    </PhoneFrame>
  )
}
