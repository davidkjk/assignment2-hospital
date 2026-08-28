// 세 문(등록·접수·예약) 공용 데이터·슬롯 계산 — 데모 `routes/staff/doors/doorData.ts` 포팅.
// 정본: `SHELL-DOOR-06`(세 문 패널 동작) · `PANEL-WORK-01/02`(패널=채우는 것 / 왼쪽=채우는 도구)
//       · `CAL-TIME-02/03`(길이 비례·5분 스냅) · `QUEUE-WALK-08b`(대기 인원).
//
// ⚠️ TODO(D1·D2·D3·D4 배선) — 이 파일의 **데이터는 전부 데모 가짜값**이다(계산 함수는 실물).
//    Wave 1에서 각 문을 배선하며 서버로 갈아끼운다:
//    ✅ D3 완료: 환자 검색은 정본 부품 `pages/patients/PatientSearch`(mode="pick")가 한다 —
//       가짜 `doorPatients`·`searchPatients`·`maskBirth`·`maskPhone`은 지웠다(`MASK-SRV-01`).
//    ✅ D3 완료: 의사 로스터·대기 인원은 `getTodaySummary().doctor_waiting`이 준다(패널 안 목록).
//    ✅ D2 완료: 소프트 중복은 서버(`GET /patients/duplicate-check`)가 가린 값으로 답한다 —
//       가짜 `findDuplicate`는 지웠다.
//      · 의사 로스터·하루 일정 → `api/calendar.ts` `getCalendar` (D4)

import type { SearchTodayStatus } from '../../api/patients'
import type { StartDoor } from '../navItems'

/** 문 = 헤더 세 버튼과 같은 이름을 쓴다(`START_DOORS`). 데모의 'reserve'가 실에선 'appointment'. */
export type DoorId = StartDoor
/** 지금 채우는 중인 패널의 칸 — 이것이 왼쪽 도구를 정한다(`PANEL-WORK-01`). */
export type FieldId = 'patient' | 'doctor' | 'date' | 'time' | 'find' | null

/** 문이 안고 다니는 환자 — **표시용 값만** 든다.
 *  ⭐ 생년월일·전화는 서버가 이미 가려서 준 문자열 그대로다(`MASK-SRV-01`) — 화면이 다시 가리지 않는다.
 *  방금 등록한 환자만 예외로 직원이 방금 친 값이 들어온다(자기가 친 값을 가릴 이유가 없다). */
export interface PatientLite {
  id: string
  name: string
  birthText: string
  phoneText: string
  /** 오늘 상태 — 검색 서버가 `/queue`와 같은 순간의 값으로 준다(`SEARCH-ACT-*`). */
  today?: { status: SearchTodayStatus; time: string | null }
}

export interface DoctorLite {
  id: string
  name: string
  department: string
  /** 오늘 대기 인원(`QUEUE-WALK-08b`) — 창구에서 「어느 선생님이 덜 기다리나」로 고른다.
   *  ⛔ 「다음 자리」는 아직 근거가 없어 적지 않는다(`QUEUE-WALK-08c` · 갭 #87). */
  waiting?: number
  // ── 아래 셋은 일간 캘린더(D4)만 쓴다. 접수 문의 의사 목록에는 없다. ──
  slotMinutes?: number
  fill?: string // 블록 면 색 (CAL-COLOR-14: 중간 톤 면)
  ink?: string // 글자·점 색
}

interface OffHours {
  doctorId: string
  start: string
  end: string
  kind: '휴진' | '점심시간' // 둘 다 빗금, 글자로 구분 (CAL-SLOT-08)
}

interface DoorAppointment {
  id: string
  doctorId: string
  patientName: string
  patientBirth: string
  phone: string
  start: string
  end: string
  status: string
  reason: string
  support?: { type: string; count: number; context: string }
}

// ── TODO(D4 배선) 의사 8명(진료과 4곳) · 휴진/점심 · 하루 예약 — 데모 캘린더와 같은 원본 ──
// 색은 정본 의사 팔레트 토큰에서만 온다(`CAL-COLOR-12`) — 데모의 하드코딩 hex를 토큰으로 바꿨다.
export const doorDoctors: DoctorLite[] = [
  { id: 'd1', name: '이정훈', department: '내과', slotMinutes: 15, fill: 'var(--doctor-palette-0-fill)', ink: 'var(--doctor-palette-0)' },
  { id: 'd2', name: '한서연', department: '내과', slotMinutes: 20, fill: 'var(--doctor-palette-3-fill)', ink: 'var(--doctor-palette-3)' },
  { id: 'd3', name: '박강우', department: '정형외과', slotMinutes: 20, fill: 'var(--doctor-palette-8-fill)', ink: 'var(--doctor-palette-8)' },
  { id: 'd4', name: '정하윤', department: '정형외과', slotMinutes: 20, fill: 'var(--doctor-palette-6-fill)', ink: 'var(--doctor-palette-6)' },
  { id: 'd5', name: '김도현', department: '이비인후과', slotMinutes: 10, fill: 'var(--doctor-palette-1-fill)', ink: 'var(--doctor-palette-1)' },
  { id: 'd6', name: '최유진', department: '가정의학과', slotMinutes: 15, fill: 'var(--doctor-palette-7-fill)', ink: 'var(--doctor-palette-7)' },
  { id: 'd7', name: '서지훈', department: '내과', slotMinutes: 15, fill: 'var(--doctor-palette-2-fill)', ink: 'var(--doctor-palette-2)' },
  { id: 'd8', name: '오세영', department: '이비인후과', slotMinutes: 15, fill: 'var(--doctor-palette-9-fill)', ink: 'var(--doctor-palette-9)' },
]

const doorOffHours: OffHours[] = [
  // 박강우 오전 휴진 — 한 덩어리로 (CAL-SLOT-03)
  { doctorId: 'd3', start: '09:00', end: '10:00', kind: '휴진' },
  // 오세영 오후 휴진
  { doctorId: 'd8', start: '15:00', end: '18:00', kind: '휴진' },
  // 점심은 의사마다 다르다 (CAL-SLOT-09)
  { doctorId: 'd1', start: '12:00', end: '13:00', kind: '점심시간' },
  { doctorId: 'd2', start: '12:30', end: '13:30', kind: '점심시간' },
  { doctorId: 'd3', start: '12:00', end: '13:00', kind: '점심시간' },
  { doctorId: 'd4', start: '12:30', end: '13:30', kind: '점심시간' },
  { doctorId: 'd5', start: '12:00', end: '13:00', kind: '점심시간' },
  { doctorId: 'd6', start: '13:00', end: '14:00', kind: '점심시간' },
  { doctorId: 'd7', start: '12:00', end: '13:00', kind: '점심시간' },
  { doctorId: 'd8', start: '12:00', end: '13:00', kind: '점심시간' },
]

const doorAppointments: DoorAppointment[] = [
  // ── 이정훈 (내과, 15분) ──
  { id: 'a1', doctorId: 'd1', patientName: '김태호', patientBirth: '1972-11-03', phone: '010-4821-9930', start: '09:00', end: '09:15', status: '예약확정', reason: '고혈압 정기 진료' },
  { id: 'a2', doctorId: 'd1', patientName: '이말녀', patientBirth: '1955-08-17', phone: '010-2841-1043', start: '09:15', end: '09:30', status: '도착', reason: '어지럼증' },
  { id: 'a3', doctorId: 'd1', patientName: '정순남', patientBirth: '1948-05-21', phone: '010-5521-8834', start: '09:45', end: '10:00', status: '예약확정', reason: '속쓰림, 소화불량' },
  { id: 'a4', doctorId: 'd1', patientName: '최민재', patientBirth: '1991-02-09', phone: '010-3372-6610', start: '10:15', end: '10:30', status: '예약신청', reason: '감기 기운, 기침' },
  {
    id: 'a5', doctorId: 'd1', patientName: '윤경아', patientBirth: '1968-07-30', phone: '010-8810-2245', start: '11:00', end: '11:15', status: '예약확정', reason: '두통 재진',
    support: { type: '변경 상담', count: 1, context: '오후 시간으로 옮길 수 있는지 상담이 들어왔습니다.' },
  },
  { id: 'a6', doctorId: 'd1', patientName: '서동일', patientBirth: '1960-03-25', phone: '010-6612-7788', start: '14:00', end: '14:15', status: '예약확정', reason: '혈압 상담' },
  { id: 'a7', doctorId: 'd1', patientName: '노상철', patientBirth: '1957-12-11', phone: '010-2231-9987', start: '15:00', end: '15:15', status: '예약확정', reason: '당화혈색소 결과' },
  { id: 'a8', doctorId: 'd1', patientName: '문해자', patientBirth: '1944-06-02', phone: '010-8890-1123', start: '16:30', end: '16:45', status: '예약신청', reason: '고지혈증 상담' },

  // ── 한서연 (내과, 20분) ──
  { id: 'b1', doctorId: 'd2', patientName: '박영수', patientBirth: '1980-04-12', phone: '010-6640-9021', start: '09:00', end: '09:20', status: '예약확정', reason: '건강검진 결과 상담' },
  {
    id: 'b2', doctorId: 'd2', patientName: '김하늘', patientBirth: '1995-12-01', phone: '010-2201-7788', start: '09:20', end: '09:40', status: '도착', reason: '복통',
    support: { type: '취소 상담', count: 2, context: '마감 후 취소 문의가 들어와 직원 확인이 필요합니다.' },
  },
  { id: 'b3', doctorId: 'd2', patientName: '이순자', patientBirth: '1951-09-25', phone: '010-4412-5567', start: '10:00', end: '10:20', status: '예약확정', reason: '당뇨 관리' },
  { id: 'b4', doctorId: 'd2', patientName: '정미경', patientBirth: '1987-06-18', phone: '010-7788-3320', start: '11:00', end: '11:20', status: '예약신청', reason: '갑상선 재검' },
  { id: 'b5', doctorId: 'd2', patientName: '한명숙', patientBirth: '1963-01-08', phone: '010-3390-4471', start: '14:00', end: '14:20', status: '예약확정', reason: '위염 재진' },
  { id: 'b6', doctorId: 'd2', patientName: '조성근', patientBirth: '1975-05-16', phone: '010-6621-2098', start: '15:20', end: '15:40', status: '예약확정', reason: '역류성 식도염' },
  { id: 'b7', doctorId: 'd2', patientName: '백지영', patientBirth: '1990-02-24', phone: '010-4471-3315', start: '16:40', end: '17:00', status: '예약신청', reason: '빈혈 상담' },

  // ── 박강우 (정형외과, 20분, 오전 휴진) ──
  { id: 'c1', doctorId: 'd3', patientName: '한지우', patientBirth: '1999-03-08', phone: '010-9921-4402', start: '10:00', end: '10:20', status: '예약확정', reason: '발목 염좌' },
  { id: 'c2', doctorId: 'd3', patientName: '오세훈', patientBirth: '1976-10-14', phone: '010-3310-8899', start: '10:20', end: '10:40', status: '도착', reason: '어깨 통증' },
  { id: 'c3', doctorId: 'd3', patientName: '신경자', patientBirth: '1959-01-27', phone: '010-6604-1120', start: '11:00', end: '11:20', status: '예약확정', reason: '무릎 관절 재진' },
  { id: 'c4', doctorId: 'd3', patientName: '임철수', patientBirth: '1970-07-02', phone: '010-2245-6690', start: '11:40', end: '12:00', status: '도착', reason: '허리 통증' },
  { id: 'c5', doctorId: 'd3', patientName: '권나영', patientBirth: '1993-08-19', phone: '010-7712-4408', start: '14:20', end: '14:40', status: '예약확정', reason: '손목 재활' },
  { id: 'c6', doctorId: 'd3', patientName: '홍성표', patientBirth: '1965-11-30', phone: '010-3315-9921', start: '15:40', end: '16:00', status: '예약확정', reason: '무릎 주사 치료' },

  // ── 정하윤 (정형외과, 20분) ──
  { id: 'e1', doctorId: 'd4', patientName: '배정호', patientBirth: '1985-11-19', phone: '010-5580-1122', start: '09:20', end: '09:40', status: '예약확정', reason: '손목 통증' },
  { id: 'e2', doctorId: 'd4', patientName: '유선영', patientBirth: '1992-04-06', phone: '010-7712-3344', start: '10:00', end: '10:20', status: '도착', reason: '발목 재활' },
  { id: 'e3', doctorId: 'd4', patientName: '조민기', patientBirth: '1978-08-30', phone: '010-3321-8890', start: '10:40', end: '11:00', status: '예약확정', reason: '무릎 물리치료' },
  { id: 'e4', doctorId: 'd4', patientName: '남기훈', patientBirth: '1966-02-14', phone: '010-9980-5567', start: '13:00', end: '13:20', status: '예약신청', reason: '어깨 재진' },
  { id: 'e5', doctorId: 'd4', patientName: '전보람', patientBirth: '1996-06-27', phone: '010-2298-7741', start: '14:40', end: '15:00', status: '예약확정', reason: '척추 교정 상담' },
  { id: 'e6', doctorId: 'd4', patientName: '고동수', patientBirth: '1958-09-04', phone: '010-6640-3312', start: '16:00', end: '16:20', status: '예약확정', reason: '허리 디스크 재진' },

  // ── 김도현 (이비인후과, 10분) ──
  { id: 'f1', doctorId: 'd5', patientName: '문지현', patientBirth: '2015-05-11', phone: '010-2211-9080', start: '09:00', end: '09:10', status: '예약확정', reason: '중이염' },
  { id: 'f2', doctorId: 'd5', patientName: '서준영', patientBirth: '1994-09-22', phone: '010-6640-1178', start: '09:10', end: '09:20', status: '도착', reason: '인후통' },
  { id: 'f3', doctorId: 'd5', patientName: '김수빈', patientBirth: '2001-12-03', phone: '010-5567-2231', start: '09:30', end: '09:40', status: '예약확정', reason: '알레르기 비염' },
  { id: 'f4', doctorId: 'd5', patientName: '이하람', patientBirth: '2010-06-18', phone: '010-8842-3301', start: '09:50', end: '10:00', status: '예약신청', reason: '어지럼' },
  {
    id: 'f5', doctorId: 'd5', patientName: '박서윤', patientBirth: '1988-03-27', phone: '010-3312-4456', start: '10:20', end: '10:30', status: '예약확정', reason: '코막힘',
    support: { type: '변경 상담', count: 1, context: '내일로 변경 가능한지 문의가 들어왔습니다.' },
  },
  { id: 'f6', doctorId: 'd5', patientName: '정우성', patientBirth: '1973-10-09', phone: '010-9921-7712', start: '11:00', end: '11:10', status: '도착', reason: '편도 부음' },
  { id: 'f7', doctorId: 'd5', patientName: '남지수', patientBirth: '2008-01-15', phone: '010-2231-5580', start: '14:00', end: '14:10', status: '예약확정', reason: '귀 통증' },
  { id: 'f8', doctorId: 'd5', patientName: '차은우', patientBirth: '1999-07-08', phone: '010-6612-9903', start: '15:30', end: '15:40', status: '예약확정', reason: '축농증 재진' },

  // ── 최유진 (가정의학과, 15분) ──
  { id: 'g1', doctorId: 'd6', patientName: '홍길순', patientBirth: '1949-02-28', phone: '010-2280-9931', start: '09:00', end: '09:15', status: '예약확정', reason: '독감 예방접종' },
  { id: 'g2', doctorId: 'd6', patientName: '김영호', patientBirth: '1982-07-14', phone: '010-6612-3390', start: '09:30', end: '09:45', status: '도착', reason: '만성 피로 상담' },
  { id: 'g3', doctorId: 'd6', patientName: '이정아', patientBirth: '1990-11-05', phone: '010-4471-8823', start: '10:00', end: '10:15', status: '예약확정', reason: '건강 상담' },
  { id: 'g4', doctorId: 'd6', patientName: '박준서', patientBirth: '1997-01-21', phone: '010-3390-5567', start: '11:00', end: '11:15', status: '예약신청', reason: '금연 상담' },
  { id: 'g5', doctorId: 'd6', patientName: '최성실', patientBirth: '1958-09-13', phone: '010-7788-1120', start: '14:30', end: '14:45', status: '예약확정', reason: '영양 상담' },
  { id: 'g6', doctorId: 'd6', patientName: '오미란', patientBirth: '1971-04-17', phone: '010-2298-6640', start: '16:00', end: '16:15', status: '예약확정', reason: '대상포진 예방접종' },

  // ── 서지훈 (내과, 15분) ──
  { id: 'h1', doctorId: 'd7', patientName: '강필성', patientBirth: '1962-08-08', phone: '010-5521-3390', start: '09:15', end: '09:30', status: '예약확정', reason: '위장약 처방' },
  { id: 'h2', doctorId: 'd7', patientName: '민혜경', patientBirth: '1984-03-19', phone: '010-3315-7788', start: '10:00', end: '10:15', status: '도착', reason: '감기 몸살' },
  { id: 'h3', doctorId: 'd7', patientName: '류시원', patientBirth: '1990-10-25', phone: '010-6640-2211', start: '10:45', end: '11:00', status: '예약확정', reason: '건강검진 상담' },
  { id: 'h4', doctorId: 'd7', patientName: '표한나', patientBirth: '2000-05-30', phone: '010-2231-8890', start: '13:30', end: '13:45', status: '예약신청', reason: '복통' },
  { id: 'h5', doctorId: 'd7', patientName: '진대성', patientBirth: '1955-11-14', phone: '010-8890-4471', start: '15:00', end: '15:15', status: '예약확정', reason: '혈압약 재처방' },

  // ── 오세영 (이비인후과, 15분, 오후 휴진) ──
  { id: 'i1', doctorId: 'd8', patientName: '양세진', patientBirth: '2012-02-11', phone: '010-2211-6640', start: '09:00', end: '09:15', status: '예약확정', reason: '중이염 재진' },
  { id: 'i2', doctorId: 'd8', patientName: '구본영', patientBirth: '1968-06-23', phone: '010-6612-2298', start: '09:45', end: '10:00', status: '도착', reason: '이명' },
  { id: 'i3', doctorId: 'd8', patientName: '심유나', patientBirth: '1995-09-07', phone: '010-3390-9921', start: '10:30', end: '10:45', status: '예약확정', reason: '알레르기 검사' },
  { id: 'i4', doctorId: 'd8', patientName: '한도경', patientBirth: '2006-12-19', phone: '010-7712-5567', start: '11:15', end: '11:30', status: '예약신청', reason: '코피 반복' },
]

/** TODO(D4 배선) 예약 문이 아직 쓰는 가짜 대기 인원 (`QUEUE-WALK-08b` — 창구에서 "덜 기다리는 의사"로 고른다) */
export const doctorWaitMap: Record<string, number> = {
  d1: 3, d2: 1, d3: 2, d4: 0, d5: 4, d6: 1, d7: 2, d8: 0,
}

// ── 등록 문이 **직원이 방금 친 값**을 이어갈 때만 쓰는 가림 ────────────────────────
// ⚠️ `MASK-SRV-01`(서버가 가린 값으로만 준다)을 어기는 것이 아니다 — 여기 들어오는 전화·생년월일은
//    **서버에서 온 값이 아니라 직원이 방금 자기 손으로 친 값**이다(등록 폼). 그 값을 이음 카드에
//    원본 그대로 크게 띄우면 창구 화면이 어깨너머로 읽히므로, 화면 표시만 같은 모양으로 맞춘다.
// ⛔ 서버가 준 `masked_*`에는 절대 다시 쓰지 않는다.

/** 010-1234-5678 → 010-****-5678 (뒷자리 남김, `MASK-TEL-01`) */
export function maskTypedPhone(tel: string): string {
  return tel.replace(/^(\d{3})-?\d{3,4}-?(\d{4})$/, '$1-****-$2')
}
/** 1958-03-12 → 1958-**-12 (월만 가림, `MASK-DOB-01`) */
export function maskTypedBirth(d: string): string {
  return d.replace(/^(\d{4})-\d{2}-(\d{2})$/, '$1-**-$2')
}

// ── 오신 시각(`QUEUE-WALK-14~16`) ────────────────────────────────────────────

/** [QUEUE-WALK-14b·14c] 콜론을 안 쳐도 된다 — `1015`→10:15, 3자리 `905`→09:05.
 *  앞의 `0`을 치게 하면 한 손으로 치는 속도가 깨진다.
 *  ⛔ [QUEUE-WALK-14d] **5분 격자에 붙이지 않는다** — 예약은 「앞으로 만들 자리」라 붙여도 되지만
 *     방문 시각은 「실제로 일어난 일의 기록」이라 붙이는 순간 거짓이 된다(`CAL-TIME-03`과 정반대). */
export function parseVisitTime(raw: string): { hh: number; mm: number } | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 3 && digits.length !== 4) return null
  const hh = Number(digits.slice(0, digits.length - 2))
  const mm = Number(digits.slice(-2))
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null
  return { hh, mm }
}

/** 직원이 적은 「날짜 + 시각」을 실제 순간으로 옮긴다.
 *  ⚠️ 브라우저 시간대로 읽는다 — 창구 컴퓨터의 시계가 곧 벽시계다. 서버는 UTC로 받아 저장한다. */
export function visitInstant(dateIso: string, hh: number, mm: number): Date {
  const [y, m, d] = dateIso.split('-').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

/** 오늘(브라우저 시간대) — `TODAY_ISO`는 D4 캘린더용 **데모 고정값**이라 여기 쓰면 안 된다. */
export function todayIsoLocal(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// ── 의사 하루 일정(일간 캘린더 도구) ──
const WIN_START = 9 * 60 // 09:00
const WIN_END = 18 * 60 // 18:00

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ── 비례 캘린더용(분 단위) ── `CAL-TIME-02`(길이 비례)·`CAL-TIME-03`(5분 스냅)
export const DAY_START_MIN = WIN_START
export const DAY_END_MIN = WIN_END
export const SNAP_MIN = 5 // 시작 시각은 5분 격자에 붙는다(CAL-TIME-03)

export interface DayBlock {
  kind: 'appt' | 'off'
  startMin: number
  endMin: number
  label: string // 예약=환자명, 휴진/점심=종류
  sub?: string // 예약 사유·상태
  offKind?: '휴진' | '점심시간'
}

/** 한 의사의 하루를 분 단위 블록으로(빈 시간은 블록이 없는 구간) */
export function buildBlocks(doctor: DoctorLite): DayBlock[] {
  const out: DayBlock[] = []
  doorAppointments
    .filter((a) => a.doctorId === doctor.id)
    .forEach((a) => out.push({ kind: 'appt', startMin: toMin(a.start), endMin: toMin(a.end), label: a.patientName, sub: a.reason }))
  doorOffHours
    .filter((o) => o.doctorId === doctor.id)
    .forEach((o) => out.push({ kind: 'off', startMin: toMin(o.start), endMin: toMin(o.end), label: o.kind, offKind: o.kind }))
  return out.sort((x, y) => x.startMin - y.startMin)
}

/** 5분 격자에 붙인다: 09:07 → 09:05 (`CAL-TIME-03`) */
export function snapMin(min: number): number {
  const snapped = Math.round(min / SNAP_MIN) * SNAP_MIN
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - SNAP_MIN, snapped))
}

/** 의사별 진료 길이(`CAL-TIME-09`). ⚠️ 접수 문이 실 로스터(`doctor_waiting`)로 고른 의사에는
 *  이 칸이 없다 — 대기 인원 조회는 진료 길이를 주지 않는다. D4가 `getCalendar().doctors`로
 *  갈아끼우면 실제 값이 들어온다. 그때까지는 기본 15분으로 그린다(계산은 예약 문에서만 쓴다). */
export function slotMinutesOf(d: DoctorLite): number {
  return d.slotMinutes ?? 15
}

/** 그 시각에 진료시간만큼 잡으면 무엇과 겹치나 — 겹침 경고용(막지는 않음, `CAL-GAP`) */
export function overlapAt(doctor: DoctorLite, startMin: number): DayBlock | null {
  const endMin = startMin + slotMinutesOf(doctor)
  for (const b of buildBlocks(doctor)) {
    if (startMin < b.endMin && endMin > b.startMin) return b
  }
  return null
}

export function minToHHMM(min: number): string {
  return toHHMM(min)
}

/** TODO(D4 배선) 오늘 날짜 — 데모는 고정값이다. 실 배선에서는 서버 기준 오늘로 바꾼다. */
export const TODAY_ISO = '2026-08-22'
export function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-')
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(iso).getDay()]
  return `${Number(m)}월 ${Number(d)}일 (${wd})`
}
