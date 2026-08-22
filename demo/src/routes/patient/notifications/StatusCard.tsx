import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  Hospital,
  LockKeyhole,
  MessageCircle,
  Phone,
  QrCode,
  Stethoscope,
  XCircle,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge'
import type { CardStatus, DemoAppointment } from './mockData'

// 정본에서 정한 색 코딩(공용 StatusBadge 톤): 예약확정=딥틸·예약신청=주황·진료대기=파랑·접수(도착)=보라 …
const STATUS_TONE: Record<CardStatus, BadgeTone> = {
  예약신청: 'amber',
  예약확정: 'teal',
  도착: 'violet',
  진료대기: 'sky',
  진료중: 'teal',
  진료완료: 'teal',
  환자취소: 'muted',
  병원취소: 'muted',
  예약부도: 'gray',
  미확정: 'amber',
}

const BADGE_LABEL: Record<CardStatus, string> = {
  예약신청: '확인 중',
  예약확정: '확정됨',
  도착: '접수됐어요',
  진료대기: '진료 대기',
  진료중: '진료 중',
  진료완료: '진료가 끝났습니다',
  환자취소: '취소됨',
  병원취소: '취소됨',
  예약부도: '시간 지남',
  미확정: '확정되지 않음',
}

function AttentionNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-l-4 border-destructive px-3 py-2 text-sm">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

function QrPreview({ bookingCode }: { bookingCode?: string }) {
  const navigate = useNavigate()
  if (!bookingCode) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed">
          <QrCode className="h-10 w-10 text-primary" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground">접수용 QR을 준비 중입니다</p>
      </div>
    )
  }

  // QR을 누르면 전체화면으로 크게 본다(NAV-HOME-02, 접수 데스크에 보여주기 쉽게).
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        navigate('/qr')
      }}
      aria-label="접수용 QR 크게 보기"
      className="flex h-full w-full items-center justify-center gap-4 rounded-lg transition-colors hover:bg-primary/5"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-lg border bg-card">
        <QrCode className="h-16 w-16 text-primary" aria-hidden="true" />
      </div>
      <div className="text-left">
        <p className="text-sm font-semibold">접수용 QR</p>
        <p className="mt-1 text-sm text-muted-foreground">예약번호 {bookingCode}</p>
        <p className="mt-1 text-xs font-medium text-primary">눌러서 크게 보기 ›</p>
      </div>
    </button>
  )
}

function StatusBody({ appointment }: { appointment: DemoAppointment }) {
  switch (appointment.status) {
    case '예약신청':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed">
            <QrCode className="h-10 w-10 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">확정되면 여기에 접수용 QR이 나타납니다</p>
        </div>
      )
    case '예약확정':
      return <QrPreview bookingCode={appointment.bookingCode} />
    case '도착':
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <CheckCircle2 className="h-9 w-9 text-primary" aria-hidden="true" />
          <p className="mt-2 font-semibold">접수되었습니다</p>
          <p className="text-sm text-muted-foreground">순서를 준비 중입니다</p>
        </div>
      )
    case '진료대기': {
      const queueAhead = appointment.queueAhead ?? 0
      const waitText =
        queueAhead === 0
          ? '곧 들어가십니다'
          : appointment.waitMinutes && appointment.waitMinutes > 60
            ? '예상 대기시간 약 1시간 이상'
            : `예상 대기시간 약 ${appointment.waitMinutes ?? 0}분`
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <Activity className="h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-1 text-lg font-semibold">
            {queueAhead === 0 ? '곧 들어가십니다' : `내 앞에 ${queueAhead}명`}
          </p>
          <p className="text-sm text-muted-foreground">{waitText}</p>
          <p className="mt-1 text-xs text-muted-foreground">예상 대기시간은 변동될 수 있습니다</p>
        </div>
      )
    }
    case '진료중':
      return (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <Stethoscope className="h-9 w-9 text-primary" aria-hidden="true" />
          <p className="mt-2 text-lg font-semibold">진료 중입니다</p>
          <p className="text-sm text-muted-foreground">보호자분은 잠시 대기해 주세요</p>
        </div>
      )
    case '진료완료':
      return (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <Check className="h-9 w-9 text-primary" aria-hidden="true" />
          <p className="mt-2 font-semibold">진료가 끝났습니다</p>
        </div>
      )
    case '환자취소':
      return (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <XCircle className="h-9 w-9 text-primary" aria-hidden="true" />
          <p className="mt-2 font-semibold">취소하셨습니다</p>
        </div>
      )
    case '병원취소':
      return (
        <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
          <Hospital className="h-9 w-9 text-primary" aria-hidden="true" />
          <p className="mt-2 font-semibold">병원에서 취소했습니다</p>
        </div>
      )
    case '예약부도':
      return <QrPreview bookingCode={appointment.bookingCode} />
    case '미확정':
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed">
            <QrCode className="h-10 w-10 text-primary" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground">아직 확정되지 않아 접수용 QR이 없습니다</p>
        </div>
      )
  }
}

function QuestionnaireLine({ appointment, onOpen }: { appointment: DemoAppointment; onOpen: () => void }) {
  const { status, questionnaireStatus, questionnaireProgress } = appointment

  // 진료가 시작되면 잠긴다(CARD-QNR: 진료중 이후 수정 불가).
  if (status === '진료중') {
    return (
      <div className="flex items-start gap-2 border-t pt-3 text-base text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>진료가 시작되어 수정할 수 없습니다 · 내용 보기 ›</span>
      </div>
    )
  }

  // 과거 진료(진료완료)는 '작성본 보기'.
  if (status === '진료완료') {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2 border-t pt-3 text-left text-base text-muted-foreground hover:text-foreground"
        onClick={onOpen}
      >
        <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>내가 작성한 사전문진 보기 ›</span>
      </button>
    )
  }

  // 예정 예약의 실제 문진 상태가 있으면 그대로 그린다(CARD-QNR/LIST-QNR). 완료는 줄을 그리지 않는다.
  const line =
    questionnaireStatus === '작성완료'
      ? null
      : questionnaireStatus === '작성중'
        ? `사전문진 작성 중${questionnaireProgress ? ` (${questionnaireProgress.answered}/${questionnaireProgress.total})` : ''} · 이어서 쓰기 ›`
        : questionnaireStatus === '미작성'
          ? '사전문진 미작성 · 작성하기 ›'
          : // 상태 기반 기본값(문진 상태 미지정 — 갤러리 등)
            status === '예약확정' || status === '도착' || status === '진료대기'
            ? '사전문진 미작성 · 작성하기 ›'
            : null

  if (!line) return null
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 border-t pt-3 text-left text-base text-primary hover:underline"
      onClick={onOpen}
    >
      <Stethoscope className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{line}</span>
    </button>
  )
}

function StatusActions({ appointment }: { appointment: DemoAppointment }) {
  const navigate = useNavigate()

  switch (appointment.status) {
    case '예약신청':
      return (
        <Button variant="outline" size="sm" onClick={() => navigate(`/appt/${appointment.id}`)}>
          신청 취소
        </Button>
      )
    case '예약확정':
      return (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/appt/${appointment.id}`)}>
            시간 변경
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/appt/${appointment.id}`)}>
            예약 취소
          </Button>
        </div>
      )
    case '진료완료':
      return (
        <Button variant="outline" size="sm" onClick={() => navigate('/history')}>
          방문 이력 보기
        </Button>
      )
    case '환자취소':
    case '병원취소':
      return (
        <Button variant="outline" size="sm" onClick={() => navigate('/book')}>
          새로 예약하기
        </Button>
      )
    case '예약부도':
    case '미확정':
      return (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/chat')}>
            <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" /> 상담 채팅 연결
          </Button>
          <a
            className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
            href="tel:02-1234-5678"
          >
            <Phone className="h-4 w-4 text-primary" aria-hidden="true" /> 병원 전화
          </a>
        </div>
      )
    default:
      return null
  }
}

export function StatusCard({ appointment }: { appointment: DemoAppointment }) {
  const navigate = useNavigate()
  const [changeNoticeVisible, setChangeNoticeVisible] = useState(Boolean(appointment.changeFrom))

  return (
    <div data-testid={`status-card-${appointment.id}`} className="space-y-2">
      {changeNoticeVisible && appointment.changeFrom && appointment.changeTo && (
        <div className="flex items-center justify-between gap-3 border-l-4 border-destructive px-3 py-2 text-sm">
          <p>
            병원 사정으로 시간이 변경되었습니다
            <span className="mt-1 block text-muted-foreground">
              {appointment.changeFrom} → {appointment.changeTo}
            </span>
          </p>
          <Button variant="outline" size="sm" onClick={() => setChangeNoticeVisible(false)}>
            확인
          </Button>
        </div>
      )}

      {appointment.status === '예약신청' && (
        <AttentionNotice>
          병원이 확인하는 중입니다. 확정되면 알림을 보내드립니다.
        </AttentionNotice>
      )}
      {appointment.status === '예약부도' && (
        <AttentionNotice>병원에 연락해 주세요</AttentionNotice>
      )}
      {appointment.status === '미확정' && (
        <AttentionNotice>
          <span className="block">병원 확인이 끝나지 않았습니다</span>
          <span className="block">병원에 연락해 주세요</span>
        </AttentionNotice>
      )}

      {/* 홈 카드도 앱 전체 글자 크기(17px)에 맞춘다 — 카드 기본 text-sm이라 작아 보였다(사용자 지적). */}
      <Card className="text-base">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-lg font-bold">
                {appointment.patientName} · {appointment.relation}
              </CardTitle>
              {/* 위계: 시간은 진하게(dark+semibold), 진료과·의사는 차분히(muted) — 밋밋함 해소. */}
              <CardDescription className="mt-1 text-base">
                <span className="font-semibold text-foreground">{appointment.time}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {appointment.department} · {appointment.doctor} 선생님
                </span>
              </CardDescription>
            </div>
            <StatusBadge label={BADGE_LABEL[appointment.status]} tone={STATUS_TONE[appointment.status]} />
          </div>
          {/* 구분선은 카드 끝까지 닿지 않게 — 안쪽 여백 안에서만(다른 구분선과 통일). */}
          <p className="border-b pb-3 text-sm text-muted-foreground">
            {appointment.status === '예약신청' || appointment.status === '미확정'
              ? '신청번호'
              : '예약번호'}{' '}
            {appointment.reference}
          </p>
        </CardHeader>

        <CardContent className="space-y-3 pt-4">
          {/* 카드 안의 카드 — 테두리 대신 또렷한 그림자로 떠 보이게(사용자: 구분되게 더). */}
          <div className="h-[132px] rounded-lg bg-primary/5 px-3 shadow-[0_2px_10px_rgba(16,45,50,0.14)]">
            <StatusBody appointment={appointment} />
          </div>

          <QuestionnaireLine appointment={appointment} onOpen={() => navigate('/questionnaire')} />

          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <div className="text-sm text-muted-foreground">
              {appointment.department} · {appointment.doctor} 선생님
            </div>
            <StatusActions appointment={appointment} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
