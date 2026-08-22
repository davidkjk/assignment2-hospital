// 데모 아이콘 = 정본 DISP-ICON-03대로 '채움(Solid)' 벡터. lucide(아웃라인)는 Solid가 없어 Phosphor로 교체.
// 앱 코드는 lucide와 같은 이름을 그대로 쓰도록 여기서 매핑해 re-export한다(각 화면은 import 경로만 바뀐다).
import type { ComponentProps, ComponentType } from 'react'
import {
  ArrowLeft as PhArrowLeft,
  ArrowSquareOut,
  Bell as PhBell,
  CalendarDots,
  CalendarPlus as PhCalendarPlus,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChatCircle,
  Check as PhCheck,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  Eye as PhEye,
  EyeSlash,
  Faders,
  GearSix,
  Hospital as PhHospital,
  House,
  MapPin as PhMapPin,
  PaperPlaneTilt,
  PencilSimple,
  Phone as PhPhone,
  QrCode as PhQrCode,
  Question,
  ShieldCheck as PhShieldCheck,
  SignOut,
  Sparkle,
  Stack,
  User,
  UserFocus,
  UserPlus as PhUserPlus,
  UsersThree,
  Warning,
  X as PhX,
  CalendarCheck,
  CalendarDot,
  ClipboardText,
  FileText as PhFileText,
  LockKey,
  Pulse,
  Stethoscope as PhStethoscope,
  WarningCircle,
  XCircle as PhXCircle,
} from '@phosphor-icons/react'

type PhProps = ComponentProps<typeof House>

// 기본은 채움(fill). 방향 캐럿(› ‹ ⌄)만은 fill이 두꺼운 삼각형이 돼 어색하므로 'bold'로 얇게 유지.
function make(Base: ComponentType<PhProps>, defaultWeight: PhProps['weight'] = 'fill') {
  return function Icon(props: PhProps) {
    return <Base weight={defaultWeight} {...props} />
  }
}

export const AlertTriangle = make(Warning)
export const ArrowLeft = make(PhArrowLeft)
export const Bell = make(PhBell)
export const CalendarDays = make(CalendarDots)
export const CalendarPlus = make(PhCalendarPlus)
export const Check = make(PhCheck)
export const CheckCircle2 = make(CheckCircle)
export const ChevronDown = make(CaretDown, 'bold')
export const ChevronLeft = make(CaretLeft, 'bold')
export const ChevronRight = make(CaretRight, 'bold')
export const Clock3 = make(Clock)
export const ExternalLink = make(ArrowSquareOut)
export const Eye = make(PhEye)
export const EyeOff = make(EyeSlash)
export const HelpCircle = make(Question)
export const History = make(ClockCounterClockwise)
export const Home = make(House)
export const Hospital = make(PhHospital)
export const Layers3 = make(Stack)
export const LogOut = make(SignOut)
export const MapPin = make(PhMapPin)
export const MessageCircle = make(ChatCircle)
export const Pencil = make(PencilSimple)
export const Phone = make(PhPhone)
export const QrCode = make(PhQrCode)
export const Send = make(PaperPlaneTilt)
export const Settings = make(GearSix)
export const Settings2 = make(Faders)
export const ShieldCheck = make(PhShieldCheck)
export const Sparkles = make(Sparkle)
export const UserPlus = make(PhUserPlus)
export const UserRound = make(User)
export const UserRoundPlus = make(PhUserPlus)
export const UserRoundSearch = make(UserFocus)
export const Users = make(UsersThree)
export const X = make(PhX)
export const Activity = make(Pulse)
export const AlertCircle = make(WarningCircle)
export const CalendarCheck2 = make(CalendarCheck)
export const CalendarClock = make(CalendarDot)
export const ClipboardList = make(ClipboardText)
export const FileText = make(PhFileText)
export const LockKeyhole = make(LockKey)
export const Stethoscope = make(PhStethoscope)
export const XCircle = make(PhXCircle)
