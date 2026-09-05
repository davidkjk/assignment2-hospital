import type { BotScript } from './types'

// 대본은 전부 "정해진 길"이다. 실제 AI가 생각하는 게 아니라, 미리 짜둔 노드를
// 칩으로 따라간다. 문구는 요구사항 5장의 원칙을 지킨다:
//  - 병을 진단하지 않는다 / 약·치료법 추천 금지 / "○○병입니다" 금지(5.3)
//  - 진료과는 안내하되 최종 선택은 환자(5.3)
//  - 긴급 표현이면 예약을 멈추고 119·응급실 안내(5.3)
//  - 예약은 마지막에 한 번 더 보여주고 눌러야 됨, 몰래 예약 금지(5.4)
//  - 모르면 직원에게 요약과 함께 인계(5.5)
//  - 답변 근거(승인 자료)를 보인다(5.6)

/** ① 앱 AI 상담 탭 — 로그인 환자. 진료과 추천→예약까지 이어진다. */
export const appScript: BotScript = {
  startId: 'start',
  nodes: {
    start: {
      id: 'start',
      bot: [
        {
          text: '안녕하세요, 김순자님. 병원 이용과 진료과를 안내해 드려요. 아래에서 고르거나 편하게 눌러 주세요.',
        },
      ],
      options: [
        { label: '어느 진료과로 가야 할지 모르겠어요', to: 'triage' },
        { label: '병원 위치·주차가 궁금해요', to: 'info_location' },
        { label: '예약을 바꾸고 싶어요', to: 'info_change' },
        { label: '직원과 상담하고 싶어요', to: 'handoff' },
      ],
    },

    // ── 진료과 선택 도움(5.3) ──
    triage: {
      id: 'triage',
      bot: [
        {
          text: '증상을 말씀해 주시면 알맞은 진료과를 안내해 드릴게요. 진단이나 처방이 아니라 어느 과로 가면 좋을지 안내예요. 어디가 불편하세요?',
        },
      ],
      options: [
        { label: '무릎이 아파요', to: 'triage_knee' },
        { label: '목이 붓고 아파요', to: 'triage_throat' },
        { label: '가슴이 조이고 숨이 차요', to: 'triage_urgent' },
      ],
    },

    triage_knee: {
      id: 'triage_knee',
      bot: [{ text: '언제부터 그러셨나요? 다치신 적이 있는지도 알려 주세요.' }],
      options: [
        { label: '계단 오르내릴 때 아파요', to: 'triage_knee_result' },
        { label: '넘어진 뒤로 부었어요', to: 'triage_knee_result' },
      ],
    },
    triage_knee_result: {
      id: 'triage_knee_result',
      bot: [
        {
          source: '진료 안내',
          text: '말씀만으로 병을 진단할 수는 없지만, 무릎 통증은 보통 정형외과에서 살펴봐요. 최종 선택은 환자분이 확인해 주세요.',
        },
        { text: '원하시면 지금 정형외과 예약을 도와드릴게요.' },
      ],
      options: [
        { label: '정형외과 예약할래요', to: 'book_knee' },
        { label: '직원과 더 얘기할래요', to: 'handoff' },
      ],
    },
    book_knee: {
      id: 'book_knee',
      bot: [{ text: '아래 내용이 맞으면 예약을 진행할게요. 제가 대신 예약하지 않고, 눌러 주셔야 예약됩니다.' }],
      card: {
        kind: 'booking',
        who: '김순자',
        deptName: '정형외과',
        doctorName: '박강우',
        when: '이번 주 목요일 오후 2:30',
        confirmTo: 'booked_knee',
      },
    },
    booked_knee: {
      id: 'booked_knee',
      bot: [{ text: '예약이 완료됐어요. 사전문진을 미리 작성하시면 진료가 더 빨라져요.' }],
      card: { kind: 'booked', bookingNo: 'A-20482' },
      end: true,
    },

    triage_throat: {
      id: 'triage_throat',
      bot: [
        {
          source: '진료 안내',
          text: '목이 붓고 아픈 증상은 보통 이비인후과에서 살펴봐요. 병명을 확정하지는 않으니, 어느 과로 갈지 최종 선택은 확인해 주세요.',
        },
        { text: '이비인후과 예약을 도와드릴까요?' },
      ],
      options: [
        { label: '이비인후과 예약할래요', to: 'book_throat' },
        { label: '직원과 상담할래요', to: 'handoff' },
      ],
    },
    book_throat: {
      id: 'book_throat',
      bot: [{ text: '아래 내용으로 예약할게요. 눌러 주셔야 예약됩니다.' }],
      card: {
        kind: 'booking',
        who: '김순자',
        deptName: '이비인후과',
        doctorName: '정우재',
        when: '내일 오전 10:00',
        confirmTo: 'booked_throat',
      },
    },
    booked_throat: {
      id: 'booked_throat',
      bot: [{ text: '예약이 완료됐어요. 사전문진을 작성해 두시면 좋아요.' }],
      card: { kind: 'booked', bookingNo: 'A-20488' },
      end: true,
    },

    // ── 긴급(5.3) — 예약을 멈추고 119 안내 ──
    triage_urgent: {
      id: 'triage_urgent',
      bot: [{ text: '말씀하신 증상은 응급 상황일 수 있어요. 일반 예약을 계속 진행하지 않을게요.' }],
      card: { kind: 'urgent' },
      end: true,
    },

    // ── 정보 안내(5.2·5.6) ──
    info_location: {
      id: 'info_location',
      bot: [
        {
          source: '병원 이용 안내',
          text: '가온병원은 시청역 2번 출구에서 걸어서 5분 거리예요. 건물 지하에 주차장이 있고, 진료를 보시면 2시간 무료입니다.',
        },
      ],
      options: [
        { label: '다른 것도 물어볼래요', to: 'start' },
        { label: '직원과 상담할래요', to: 'handoff' },
      ],
    },
    info_change: {
      id: 'info_change',
      bot: [
        {
          source: '병원 이용 안내',
          text: '예약 변경·취소는 [나의 예약]에서 하실 수 있어요. 진료 24시간 전까지는 앱에서 바로 바꿀 수 있고, 시간이 지난 경우에는 직원이 확인해 도와드려요.',
        },
      ],
      options: [
        { label: '직원과 상담할래요', to: 'handoff' },
        { label: '괜찮아요, 다른 것 물어볼래요', to: 'start' },
      ],
    },

    // ── 직원 연결(5.5) — 요약을 함께 인계 ──
    handoff: {
      id: 'handoff',
      bot: [
        {
          text: '제가 확인하기 어려운 내용이라 직원에게 연결해 드릴게요. 처음부터 다시 설명하지 않으셔도 돼요 — 지금까지 나눈 내용을 함께 전달해요.',
        },
      ],
      card: {
        kind: 'handoff',
        hours: 'in',
        summary: [
          { label: '궁금해한 내용', value: '무릎 통증으로 어느 진료과에 가야 할지' },
          { label: '확인한 정보', value: '계단을 오르내릴 때 통증, 다친 적 없음' },
          { label: '안내한 내용', value: '정형외과 상담을 안내함' },
          { label: '해결되지 않은 이유', value: '통증 원인 판단은 의료진 확인이 필요' },
        ],
      },
      end: true,
    },
  },
}

/** ③ 병원 홈페이지 웹 상담창 — 익명(로그인 전). 요구사항 5.1.
 *  앱과 같은 봇이지만 예약은 로그인 후로 안내하고(99 auth-modal), 직원 연결은
 *  다음 영업일 답변으로 남긴다(100 anonymous-handoff). */
export const webScript: BotScript = {
  startId: 'start',
  nodes: {
    start: {
      id: 'start',
      bot: [
        {
          text: '안녕하세요! 가온병원 상담봇이에요. 병원 이용과 진료과를 안내해 드려요. 아래에서 골라 주세요.',
        },
      ],
      options: [
        { label: '증상으로 진료과 찾기', to: 'triage' },
        { label: '위치·주차', to: 'info_location' },
        { label: '진료시간·휴진일', to: 'info_hours' },
        { label: '직원과 상담하기', to: 'handoff' },
      ],
    },
    triage: {
      id: 'triage',
      bot: [
        {
          text: '증상을 말씀해 주시면 알맞은 진료과를 안내해 드릴게요. 진단이 아니라 어느 과로 가면 좋을지 안내예요. 어디가 불편하세요?',
        },
      ],
      options: [
        { label: '무릎이 아파요', to: 'knee' },
        { label: '목이 붓고 아파요', to: 'throat' },
        { label: '가슴이 조이고 숨이 차요', to: 'urgent' },
      ],
    },
    knee: {
      id: 'knee',
      bot: [
        {
          source: '진료 안내',
          text: '무릎 통증은 보통 정형외과에서 살펴봐요. 병명을 확정하지는 않으니 최종 선택은 확인해 주세요.',
        },
      ],
      // 익명이라 예약은 로그인 필요 행동 — 버튼을 누르면 위젯 위에 인증 모달이 뜬다(WEBMOD-AUTH-01).
      card: { kind: 'bookingAuth', deptName: '정형외과', resumeTo: 'book_os' },
      options: [{ label: '직원과 상담하기', to: 'handoff' }],
    },
    // 로그인 성공 후 복귀하는 예약 확인(WEBMOD-AUTH-07 — 확인 단계를 건너뛰지 않는다).
    book_os: {
      id: 'book_os',
      bot: [{ text: '로그인됐어요. 아래 내용으로 예약할게요. 눌러야 예약됩니다.' }],
      card: {
        kind: 'booking',
        who: '김순자',
        deptName: '정형외과',
        doctorName: '박강우',
        when: '이번 주 목요일 오후 2:30',
        confirmTo: 'booked_os',
      },
    },
    booked_os: {
      id: 'booked_os',
      bot: [{ text: '예약이 완료됐어요. 사전문진을 미리 작성하시면 진료가 더 빨라져요.' }],
      card: { kind: 'booked', bookingNo: 'W-20501' },
      end: true,
    },
    throat: {
      id: 'throat',
      bot: [
        {
          source: '진료 안내',
          text: '목이 붓고 아픈 증상은 보통 이비인후과에서 살펴봐요. 최종 선택은 확인해 주세요.',
        },
      ],
      card: { kind: 'bookingAuth', deptName: '이비인후과', resumeTo: 'book_ent' },
      options: [{ label: '직원과 상담하기', to: 'handoff' }],
    },
    book_ent: {
      id: 'book_ent',
      bot: [{ text: '로그인됐어요. 아래 내용으로 예약할게요. 눌러야 예약됩니다.' }],
      card: {
        kind: 'booking',
        who: '김순자',
        deptName: '이비인후과',
        doctorName: '정우재',
        when: '내일 오전 10:00',
        confirmTo: 'booked_ent',
      },
    },
    booked_ent: {
      id: 'booked_ent',
      bot: [{ text: '예약이 완료됐어요. 사전문진을 작성해 두시면 좋아요.' }],
      card: { kind: 'booked', bookingNo: 'W-20508' },
      end: true,
    },
    urgent: {
      id: 'urgent',
      bot: [{ text: '말씀하신 증상은 응급 상황일 수 있어요. 예약 안내를 계속 진행하지 않을게요.' }],
      card: { kind: 'urgent' },
      end: true,
    },
    info_location: {
      id: 'info_location',
      bot: [
        {
          source: '병원 이용 안내',
          text: '가온병원은 시청역 2번 출구에서 걸어서 5분 거리예요. 건물 지하에 주차장이 있고, 진료를 보시면 2시간 무료입니다.',
        },
      ],
      options: [
        { label: '다른 것도 물어볼래요', to: 'start' },
        { label: '직원과 상담하기', to: 'handoff' },
      ],
    },
    info_hours: {
      id: 'info_hours',
      bot: [
        {
          source: '병원 이용 안내',
          text: '평일은 오전 9시부터 오후 6시까지, 토요일은 오전 9시부터 오후 1시까지 진료해요. 일요일과 공휴일은 휴진입니다.',
        },
      ],
      options: [
        { label: '다른 것도 물어볼래요', to: 'start' },
        { label: '직원과 상담하기', to: 'handoff' },
      ],
    },
    handoff: {
      id: 'handoff',
      bot: [
        {
          text: '제가 확인하기 어려운 내용이라 직원에게 남겨 둘게요. 처음부터 다시 설명하지 않으셔도 돼요 — 지금까지 나눈 내용을 함께 전달해요.',
        },
      ],
      card: {
        kind: 'handoff',
        hours: 'out',
        summary: [
          { label: '궁금해한 내용', value: '무릎 통증으로 어느 진료과에 가야 할지' },
          { label: '확인한 정보', value: '무릎 통증, 다친 적 없음' },
          { label: '안내한 내용', value: '정형외과 상담을 안내함' },
          { label: '해결되지 않은 이유', value: '통증 원인 판단은 의료진 확인이 필요' },
        ],
      },
      end: true,
    },
  },
}

/** ② 예약 흐름 「어느 과인지 모르겠어요」 시트 — 제한 모드(정본 BOOK-BOT-07).
 *  정보성 안내 + 진료과 추천만. 유일한 출구는 `○○과로 계속하기`.
 *  예약·취소·문진 카드를 내밀지 않는다. */
export const bookingSheetScript: BotScript = {
  startId: 'start',
  nodes: {
    start: {
      id: 'start',
      bot: [
        {
          text: '어디가 불편하신지 말씀해 주시면 알맞은 진료과를 알려드릴게요. 진단이 아니라 어느 과로 가면 좋을지 안내예요.',
        },
      ],
      options: [
        { label: '무릎이 아파요', to: 'knee' },
        { label: '목이 붓고 아파요', to: 'throat' },
        { label: '피부에 뭐가 났어요', to: 'skin' },
      ],
    },
    knee: {
      id: 'knee',
      bot: [{ text: '언제부터 아프셨나요? 다치신 적이 있는지도 알려 주세요.' }],
      options: [
        { label: '계단에서 아파요', to: 'knee_result' },
        { label: '넘어진 뒤로 아파요', to: 'knee_result' },
      ],
    },
    knee_result: {
      id: 'knee_result',
      bot: [
        {
          source: '진료 안내',
          text: '무릎 통증은 보통 정형외과에서 살펴봐요. 병명을 확정하지는 않으니 최종 선택은 확인해 주세요.',
        },
      ],
      card: { kind: 'deptResult', deptId: 'd-os', deptName: '정형외과' },
      end: true,
    },
    throat: {
      id: 'throat',
      bot: [
        {
          source: '진료 안내',
          text: '목이 붓고 아픈 증상은 보통 이비인후과에서 살펴봐요. 최종 선택은 확인해 주세요.',
        },
      ],
      card: { kind: 'deptResult', deptId: 'd-ent', deptName: '이비인후과' },
      end: true,
    },
    skin: {
      id: 'skin',
      bot: [
        {
          source: '진료 안내',
          text: '피부에 생긴 증상은 보통 피부과에서 살펴봐요. 최종 선택은 확인해 주세요.',
        },
      ],
      card: { kind: 'deptResult', deptId: 'd-derm', deptName: '피부과' },
      end: true,
    },
  },
}
