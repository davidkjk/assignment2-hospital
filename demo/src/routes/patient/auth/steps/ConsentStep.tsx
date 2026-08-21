import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hospitalInfo } from '@/routes/patient/settings/mockData'
import type { ConsentKey } from '../signupState'
import type { SignupWizardContext } from '../SignupWizard'

const CONSENT_ITEMS: {
  key: ConsentKey
  label: string
  subtitle: string
  required: boolean
}[] = [
  { key: 'terms', label: '[필수] 서비스 이용약관', subtitle: '서비스 이용에 필요한 약속', required: true },
  {
    key: 'privacy',
    label: '[필수] 개인정보 수집·이용',
    subtitle: '이름 · 생년월일 · 성별 · 전화번호',
    required: true,
  },
  {
    key: 'health',
    label: '[필수] 민감정보(건강정보) 처리',
    subtitle: '문진 답변 · 진료기록 · 처방',
    required: true,
  },
  { key: 'ads', label: '[선택] 광고성 정보 수신', subtitle: '검진·행사 안내', required: false },
]

const REQUIRED_KEYS: ConsentKey[] = ['terms', 'privacy', 'health']

export function ConsentStep({ state, next, setConsent, setRequiredConsents }: SignupWizardContext) {
  const [expanded, setExpanded] = useState<ConsentKey | null>(null)
  const requiredAll = REQUIRED_KEYS.every((key) => state.consents[key])
  const missingCount = REQUIRED_KEYS.filter((key) => !state.consents[key]).length

  return (
    <div data-testid="signup-consent" className="flex min-h-full flex-col">
      <div>
        <h2 className="text-xl font-bold">가입 전에 약관에 동의해 주세요</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          꼭 필요한 항목부터 안내해 드립니다.
        </p>

        <button
          type="button"
          aria-pressed={requiredAll}
          onClick={() => setRequiredConsents(!requiredAll)}
          className="mt-5 flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left font-semibold hover:border-primary"
        >
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
              requiredAll ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
            }`}
          >
            {requiredAll ? '✓' : ''}
          </span>
          필수 항목에 모두 동의
        </button>

        <div className="mt-3 divide-y rounded-xl border">
          {CONSENT_ITEMS.map((item) => {
            const isExpanded = expanded === item.key
            return (
              <div key={item.key} className="p-3">
                <div className="flex items-start gap-3">
                  <input
                    id={`consent-${item.key}`}
                    type="checkbox"
                    aria-label={item.label}
                    checked={state.consents[item.key]}
                    onChange={(event) => setConsent(item.key, event.target.checked)}
                    className="mt-1 h-5 w-5 accent-primary"
                  />
                  <label htmlFor={`consent-${item.key}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{item.subtitle}</span>
                    {!item.required && (
                      <span className="mt-1 block text-xs text-primary">
                        안 받아도 예약 알림은 그대로 옵니다
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    aria-label={`${item.label} 자세히 보기`}
                    onClick={() => setExpanded(isExpanded ? null : item.key)}
                    className="rounded-full p-1 text-xl leading-none text-muted-foreground hover:bg-muted"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                {isExpanded && (
                  <div className="mt-3 rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">
                    {item.label} 본문 자리표시자입니다. 약관 전문은 병원에서 작성합니다.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-auto pt-5">
        <Button size="lg" className="h-12 w-full text-base" disabled={!requiredAll} onClick={next}>
          다음
        </Button>
        {missingCount > 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            필수 항목 {missingCount}개가 남았습니다
          </p>
        )}
        <a
          href={`tel:${hospitalInfo.phone}`}
          className="mt-4 block text-center text-xs text-muted-foreground underline underline-offset-4"
        >
          동의 없이 이용하려면 병원으로 전화 주세요 · {hospitalInfo.phone}
        </a>
      </div>
    </div>
  )
}
