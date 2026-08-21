import { useState } from 'react'
import { ChevronRight, Phone, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FamilyPage } from './FamilyPage'
import { addFamilyMember } from './familyState'

export function ExistingFamily() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [relation, setRelation] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [connected, setConnected] = useState(false)

  function sendOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!phone.trim()) return
    // 일치하는 환자가 있든 없든 같은 다음 화면을 보여 주어 계정 열거를 막는다.
    setOtpSent(true)
  }

  function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!otpSent || otp.trim().length !== 6) return

    addFamilyMember({
      id: `family-linked-${Date.now()}`,
      name: name.trim() || '연결된 가족',
      birthDate: birthDate || '1990-01-01',
      // 성별은 기존 병원 기록에서 온 값이며 연결 화면에서 묻지 않는다.
      gender: 'F',
      relation: relation.trim() || '가족(연결)',
      phone: phone.trim(),
      source: 'existing',
      isActive: true,
      canEditIdentity: false,
      identityLockReason: '병원에 문의하시면 수정해 드립니다',
    })
    setConnected(true)
  }

  return (
    <FamilyPage testId="family-add-existing" title="기존 환자 연결" onBack={() => navigate('/family/add')}>
      {connected ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">연결됐어요</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              가족 목록에서 연결된 가족을 확인할 수 있어요.
            </p>
          </div>
          <Button type="button" size="lg" className="w-full" onClick={() => navigate('/family', { replace: true })}>
            가족 목록 보기
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold">가족의 정보를 입력해 주세요</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              가족의 병원 기록과 연결하기 위해 확인합니다.
            </p>
          </div>

          <form className="flex flex-col gap-4" onSubmit={sendOtp}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="family-existing-name">이름</Label>
              <Input
                id="family-existing-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="가족 이름을 입력해 주세요"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="family-existing-birth-date">생년월일</Label>
              <Input
                id="family-existing-birth-date"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="family-existing-phone">휴대폰 번호</Label>
              <Input
                id="family-existing-phone"
                data-testid="existing-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="010-0000-0000"
                autoComplete="tel"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="family-existing-relation">관계</Label>
              <Input
                id="family-existing-relation"
                value={relation}
                onChange={(event) => setRelation(event.target.value.slice(0, 20))}
                placeholder="예: 어머니"
              />
            </div>

            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p>입력하신 정보가 맞든 아니든 같은 화면으로 진행합니다.</p>
              <p className="mt-1 text-muted-foreground">
                병원 기록 여부는 알려드리지 않으며, 휴대폰으로 인증번호를 확인해 주세요.
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={!phone.trim()}>
              <Phone className="mr-1 h-4 w-4" /> 인증번호 받기
            </Button>
          </form>

          <form className="flex flex-col gap-3 border-t pt-5" onSubmit={connect}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">인증번호 입력</h3>
            </div>
            {otpSent ? (
              <p className="text-sm text-muted-foreground">인증번호를 보냈습니다.</p>
            ) : (
              <p className="text-sm text-muted-foreground">먼저 인증번호 받기를 눌러 주세요.</p>
            )}
            <Label htmlFor="family-existing-otp">인증번호</Label>
            <Input
              id="family-existing-otp"
              data-testid="existing-otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6자리 숫자"
              disabled={!otpSent}
              required
            />
            <Button type="submit" size="lg" className="w-full" disabled={!otpSent || otp.length !== 6}>
              연결하기 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </form>

          <div className="rounded-xl border p-3">
            <p className="font-medium">휴대폰이 없거나, 번호가 바뀐 가족인가요?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              병원에 문의하시면 직원이 확인 후 연결해 드립니다.
            </p>
          </div>
        </div>
      )}
    </FamilyPage>
  )
}
