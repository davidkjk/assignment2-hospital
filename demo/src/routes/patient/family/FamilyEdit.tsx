import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { initialAppointments } from '@/mock/data'
import { FamilyDialog, FamilyPage } from './FamilyPage'
import { getFamilyMember, unlinkFamilyMember, updateFamilyMember } from './familyState'
import { relationOptions } from './mockData'
import type { FamilyGender, FamilyMember } from './mockData'

function appointmentFor(member: FamilyMember) {
  return initialAppointments.find((appointment) => appointment.patientName === member.name)
}

export function FamilyEdit() {
  const navigate = useNavigate()
  const { memberId = '' } = useParams()
  const member = getFamilyMember(memberId)
  const [name, setName] = useState(member?.name ?? '')
  const [birthDate, setBirthDate] = useState(member?.birthDate ?? '')
  const [gender, setGender] = useState<FamilyGender | ''>(member?.gender ?? '')
  const [relation, setRelation] = useState(member?.relation ?? '')
  const [dialog, setDialog] = useState<'blocked' | 'confirm' | null>(null)

  if (!member) {
    return (
      <FamilyPage testId="family-edit" title="가족 정보 수정" onBack={() => navigate('/family')}>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">가족 정보를 찾을 수 없습니다.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => navigate('/family')}>
            가족 목록 보기
          </Button>
        </div>
      </FamilyPage>
    )
  }

  const editableMember = member
  const identityEditable = editableMember.canEditIdentity
  const upcomingAppointment = appointmentFor(editableMember)

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || !birthDate || !gender) return
    updateFamilyMember(editableMember.id, {
      name: name.trim(),
      birthDate,
      gender,
      relation: relation.trim() || '가족',
    })
    navigate('/family', { replace: true })
  }

  function requestUnlink() {
    setDialog(upcomingAppointment ? 'blocked' : 'confirm')
  }

  function confirmUnlink() {
    unlinkFamilyMember(editableMember.id)
    navigate('/family', { replace: true })
  }

  return (
    <FamilyPage testId="family-edit" title="가족 정보 수정" onBack={() => navigate('/family')}>
      <form className="flex flex-col gap-5" onSubmit={save}>
        <div>
          <h2 className="text-xl font-bold">{editableMember.name}님의 정보</h2>
          {identityEditable ? (
            <p className="mt-2 text-sm text-muted-foreground">
              이름·생년월일·성별과 관계를 바꿀 수 있어요.
            </p>
          ) : (
            // 잠긴 이유는 두 가지(FAM-EDIT-05·08) — 멤버의 실제 사유를 그대로 보여준다.
            <div className="mt-2 space-y-1">
              <p className="text-sm text-muted-foreground">
                <b className="font-semibold text-foreground">이름·생년월일·성별</b>은 여기서 바꿀 수 없어요. 관계는
                언제든 바꿀 수 있어요.
              </p>
              <p className="text-sm font-medium text-foreground">
                {editableMember.identityLockReason ?? '진료 기록이 있어 병원에서만 수정할 수 있습니다'}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-edit-name">이름</Label>
          <Input
            id="family-edit-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!identityEditable}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-edit-birth-date">생년월일</Label>
          <Input
            id="family-edit-birth-date"
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            disabled={!identityEditable}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">성별</legend>
          <div role="radiogroup" aria-label="성별" className="grid grid-cols-2 gap-2">
            {(
              [
                ['F', '여'],
                ['M', '남'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-lg border px-3 py-3 text-sm"
              >
                <input
                  type="radio"
                  name="family-edit-gender"
                  value={value}
                  checked={gender === value}
                  onChange={() => setGender(value)}
                  disabled={!identityEditable}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="family-edit-relation">관계</Label>
          <div className="flex flex-wrap gap-2">
            {relationOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant={relation === option ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setRelation(option)}
              >
                {option}
              </Button>
            ))}
          </div>
          <Input
            id="family-edit-relation"
            value={relation}
            onChange={(event) => setRelation(event.target.value.slice(0, 20))}
            placeholder="관계를 직접 입력할 수 있어요"
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={!name.trim() || !birthDate || !gender}>
          저장하기
        </Button>
      </form>

      {!editableMember.relation || editableMember.relation === '본인' ? null : (
        <section className="mt-10 border-t pt-6">
          <h2 className="font-semibold">가족 연결 관리</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            연결을 해제하면 이 가족의 정보가 내 앱에서 보이지 않게 됩니다.
          </p>
          <Button type="button" variant="outline" className="mt-4" onClick={requestUnlink}>
            연결 해제
          </Button>
        </section>
      )}

      {dialog === 'blocked' && upcomingAppointment ? (
        <FamilyDialog
          testId="family-unlink-blocked-dialog"
          title="연결을 해제할 수 없어요"
          onClose={() => setDialog(null)}
        >
          <p>먼저 예약을 취소해 주세요.</p>
          <p className="mt-2 text-muted-foreground">
            {upcomingAppointment.date} {upcomingAppointment.time} · {upcomingAppointment.deptName}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full"
            onClick={() => navigate(`/appt/${upcomingAppointment.id}`)}
          >
            예약 보러 가기
          </Button>
        </FamilyDialog>
      ) : null}

      {dialog === 'confirm' ? (
        <div
          data-testid="family-unlink-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="family-unlink-confirm-title"
          className="fixed inset-0 z-10 flex items-center justify-center bg-background/80 p-6"
        >
          <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl">
            <h2 id="family-unlink-confirm-title" className="text-base font-bold">
              가족 연결을 해제할까요?
            </h2>
            <p className="mt-3 text-sm">
              병원 기록에는 그대로 남지만, 앱에서는 더 이상 보이지 않습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                닫기
              </Button>
              <Button type="button" variant="destructive" onClick={confirmUnlink}>
                연결 해제
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </FamilyPage>
  )
}
