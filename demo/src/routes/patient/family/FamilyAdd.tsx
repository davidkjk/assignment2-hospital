import { ChevronRight, UserRoundPlus, UserRoundSearch } from '@/components/icons'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { FamilyDialog, FamilyPage } from './FamilyPage'
import { useFamilyStore } from './familyState'

export function FamilyAdd() {
  const navigate = useNavigate()
  const { members } = useFamilyStore()
  const showMaxNotice = members.length >= 10

  return (
    <FamilyPage testId="family-add" title="가족 추가하기" onBack={() => navigate('/family')}>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-bold">어떤 가족을 추가할까요?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            먼저 가족의 병원 이용 여부를 선택해 주세요.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              aria-label="우리 병원이 처음이에요"
              onClick={() => navigate('/family/add/new')}
              className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-primary/5"
            >
              <span className="rounded-full bg-primary/10 p-2">
                <UserRoundPlus className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">우리 병원이 처음이에요</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  이름·생년월일만 적으면 바로 등록됩니다
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-primary" />
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <button
              type="button"
              aria-label="전에 진료받은 적이 있어요"
              onClick={() => navigate('/family/add/existing')}
              className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-primary/5"
            >
              <span className="rounded-full bg-primary/10 p-2">
                <UserRoundSearch className="h-5 w-5 text-primary" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">전에 진료받은 적이 있어요</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  휴대폰으로 인증번호를 보냅니다
                </span>
                <span className="mt-2 block text-xs text-destructive">
                  휴대폰이 없으면 병원에 문의해 주세요
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-primary" />
            </button>
          </CardContent>
        </Card>
      </div>

      {showMaxNotice ? (
        <FamilyDialog testId="family-max-dialog" title="가족을 더 추가할 수 없어요" onClose={() => navigate('/family')}>
          <p>가족은 최대 10명까지 등록하실 수 있습니다.</p>
          <p className="mt-2 text-muted-foreground">더 필요하시면 병원에 문의해 주세요.</p>
        </FamilyDialog>
      ) : null}
    </FamilyPage>
  )
}
