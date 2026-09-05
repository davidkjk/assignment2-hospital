import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FamilyPage } from './FamilyPage'
import { addFamilyMember } from './familyState'
import { relationOptions } from './mockData'
import type { FamilyGender } from './mockData'

export function NewFamily() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<FamilyGender | ''>('')
  const [phone, setPhone] = useState('')
  const [relation, setRelation] = useState('')

  const canSubmit = Boolean(name.trim() && birthDate && gender)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !gender) return

    addFamilyMember({
      id: `family-new-${Date.now()}`,
      name: name.trim(),
      birthDate,
      gender,
      relation: relation.trim() || '가족',
      phone: phone.trim() || undefined,
      source: 'new',
      isActive: true,
      canEditIdentity: true,
    })
    navigate('/family', { replace: true })
  }

  return (
    <FamilyPage testId="family-add-new" title="새 가족 등록" onBack={() => navigate('/family/add')}>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div>
          <h2 className="text-xl font-bold">가족 정보를 입력해 주세요</h2>
          <p className="mt-2 text-sm text-muted-foreground">새로운 환자 프로필을 만듭니다.</p>
        </div>

        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          이미 병원에 방문·예약하신 적 있는 가족이라면 새로 추가하지 마세요. 새로 추가하면 과거 기록과 별도로 관리됩니다.
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-new-name">이름</Label>
          <Input
            id="family-new-name"
            data-testid="family-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름을 입력해 주세요"
            autoComplete="name"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-new-birth-date">생년월일</Label>
          <Input
            id="family-new-birth-date"
            data-testid="family-birth-date"
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            required
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">성별 (문진 문항 노출에 쓰입니다)</legend>
          <div role="radiogroup" aria-label="성별" className="grid grid-cols-2 gap-2">
            {(
              [
                ['F', '여'],
                ['M', '남'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors hover:border-primary hover:bg-primary/5 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
              >
                <input
                  type="radio"
                  name="family-gender"
                  value={value}
                  checked={gender === value}
                  onChange={() => setGender(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">성별을 선택해야 등록할 수 있어요.</p>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-new-relation">관계</Label>
          <div className="flex flex-wrap gap-2">
            {relationOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant={relation === option ? 'secondary' : 'outline'}
                size="sm"
                className={relation === option
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/80'
                  : 'hover:border-primary hover:bg-primary/5'}
                onClick={() => setRelation(option)}
              >
                {option}
              </Button>
            ))}
            <Button
              type="button"
              variant={relation && !relationOptions.includes(relation as (typeof relationOptions)[number]) ? 'secondary' : 'outline'}
              size="sm"
              className={relation && !relationOptions.includes(relation as (typeof relationOptions)[number])
                ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/80'
                : 'hover:border-primary hover:bg-primary/5'}
              onClick={() => setRelation('')}
            >
              기타 +
            </Button>
          </div>
          <Input
            id="family-new-relation"
            data-testid="family-relation"
            value={relation}
            onChange={(event) => setRelation(event.target.value.slice(0, 20))}
            placeholder="관계를 직접 입력할 수 있어요"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-new-phone">전화번호 (선택)</Label>
          <Input
            id="family-new-phone"
            data-testid="family-phone"
            aria-label="전화번호"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="010-0000-0000"
            autoComplete="tel"
          />
          <p className="text-xs text-muted-foreground">
            비워두시면 보호자(내) 번호로 표시되고, 알림도 내 휴대폰으로 옵니다.
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          등록하기
        </Button>
      </form>
    </FamilyPage>
  )
}
