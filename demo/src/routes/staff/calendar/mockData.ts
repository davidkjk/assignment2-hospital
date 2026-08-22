// 예약 캘린더 가짜 데이터 (CAL-*) — 하루 보기(의사 열), 09:00–18:00 종일.
// 요구사항 원문(line 13): 의사 5~8명 · 하루 외래 100명 안팎 → 의사 8명(진료과 4곳).
// 색은 정본 의사 팔레트(CAL-COLOR-12)에서 서로 먼 것부터. 빨강·주황은 상태색이 쓰므로 안 씀(CAL-COLOR-15).

export type CalendarStatus = '예약확정' | '예약신청' | '도착'
export type SupportType = '취소 상담' | '변경 상담'

/** 화면 시간 창 — 하루 종일 09:00~18:00 */
export const WIN_START = '09:00'
export const WIN_END = '18:00'
/** 1분당 픽셀 (기본 배율). 가장 짧은 슬롯(10분)도 한 줄이 안 잘리게 넉넉히(=20px).
 *  CAL-ZOOM으로 직원이 조절, [기본 배율]로 복귀 */
export const PX_PER_MIN_DEFAULT = 2
export const PX_PER_MIN_MIN = 0.5 // 1시간 30px (하루가 한 화면)
export const PX_PER_MIN_MAX = 4 // 1시간 240px (5분도 글자 들어감)

export interface CalendarDoctor {
  id: string
  name: string
  department: string
  slotMinutes: number
  fill: string // 블록 면 색 (CAL-COLOR-14: 중간 톤 면)
  ink: string // 글자·점 색
}

export interface OffHours {
  doctorId: string
  start: string
  end: string
  kind: '휴진' | '점심시간' // 둘 다 빗금, 글자로 구분 (CAL-SLOT-08)
}

export interface CalendarAppointment {
  id: string
  doctorId: string
  patientName: string
  patientBirth: string
  phone: string
  start: string
  end: string
  status: CalendarStatus
  reason: string
  /** 마감 후 취소·변경 상담이 걸린 예약 (SUPPORT-CAL-*) */
  support?: { type: SupportType; count: number; context: string }
}

// 의사 8명(상한) · 진료과 4곳 (내과 3 · 정형외과 2 · 이비인후과 2 · 가정의학과 1)
export const calendarDoctors: CalendarDoctor[] = [
  { id: 'd1', name: '이정훈', department: '내과', slotMinutes: 15, fill: '#CBDDFF', ink: '#1360A6' },
  { id: 'd2', name: '한서연', department: '내과', slotMinutes: 20, fill: '#B4E8D1', ink: '#0B6C4E' },
  { id: 'd3', name: '박강우', department: '정형외과', slotMinutes: 20, fill: '#E8D5FE', ink: '#6D4F9B' },
  { id: 'd4', name: '정하윤', department: '정형외과', slotMinutes: 20, fill: '#B1E4FF', ink: '#196584' },
  { id: 'd5', name: '김도현', department: '이비인후과', slotMinutes: 10, fill: '#EEDBB3', ink: '#735C02' },
  { id: 'd6', name: '최유진', department: '가정의학과', slotMinutes: 15, fill: '#CDE4BD', ink: '#386A20' },
  { id: 'd7', name: '서지훈', department: '내과', slotMinutes: 15, fill: '#FFCEE0', ink: '#A03865' },
  { id: 'd8', name: '오세영', department: '이비인후과', slotMinutes: 15, fill: '#DFDFB5', ink: '#5F6135' },
]

export const calendarOffHours: OffHours[] = [
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

export const calendarAppointments: CalendarAppointment[] = [
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

/** 전화 예약 — 환자 찾기(한 칸 통합검색) 재현용 가짜 결과 */
export const patientSearchResults = [
  { id: 'p1', name: '강동훈', birth: '1983-05-11', phone: '010-2211-4590' },
  { id: 'p2', name: '문소희', birth: '1990-08-22', phone: '010-8842-3301' },
  { id: 'p3', name: '조은비', birth: '2001-12-03', phone: '010-5567-9910' },
]
