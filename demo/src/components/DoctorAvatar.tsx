// 의사 일러스트 아바타 — 데모는 실제 사진 파일이 없어 자체 완결 SVG로 그린다.
// (실제 앱은 병원이 올린 doctor.photoUrl 사진이 여기 들어간다.)
// 의사마다 배경색·피부톤·머리색·안경을 다르게 해 얼굴처럼 구별되게 한다.

const BG = ['#D7ECEC', '#DCE7F5', '#E2EFDD', '#F6E7CF', '#F3DCE0', '#E7E1F3']
const SKIN = ['#F2C79B', '#E8B489', '#D89B6C', '#C6885A']
const HAIR = ['#2B2B2B', '#4A3524', '#6B4A2E', '#8A8A8A']

function hash(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

export function DoctorAvatar({
  seed,
  name,
  photoUrl,
  className = 'h-14 w-14',
}: {
  seed: string
  name: string
  /** 병원이 올린 실제 의사 사진. 있으면 사진, 없으면 SVG 일러스트. */
  photoUrl?: string
  className?: string
}) {
  if (photoUrl) {
    return (
      <span className={`shrink-0 overflow-hidden rounded-full bg-[#E7EEF0] ${className}`}>
        <img
          src={photoUrl}
          alt={`${name} 선생님`}
          loading="lazy"
          className="h-full w-full object-cover"
          style={{ objectPosition: '50% 22%' }}
        />
      </span>
    )
  }

  const h = hash(seed)
  const bg = BG[h % BG.length]
  const skin = SKIN[(h >> 3) % SKIN.length]
  const hair = HAIR[(h >> 5) % HAIR.length]
  const glasses = (h >> 7) % 2 === 0

  return (
    <span className={`shrink-0 overflow-hidden rounded-full ${className}`}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-label={`${name} 선생님`}>
        <rect width="100" height="100" fill={bg} />
        {/* 흰 가운 어깨 */}
        <path d="M18 100 C18 78 34 70 50 70 C66 70 82 78 82 100 Z" fill="#FFFFFF" />
        <path d="M50 70 L44 100 L56 100 Z" fill="#EAF1F1" />
        {/* 청진기 */}
        <path d="M40 72 C40 86 60 86 60 72" fill="none" stroke="#0B6E70" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="60" cy="74" r="3.2" fill="#0B6E70" />
        {/* 목 */}
        <rect x="44" y="58" width="12" height="14" rx="6" fill={skin} />
        {/* 머리 */}
        <circle cx="50" cy="44" r="20" fill={skin} />
        {/* 머리카락 */}
        <path d="M29 44 C29 30 40 22 50 22 C60 22 71 30 71 44 C71 36 62 33 50 33 C38 33 29 36 29 44 Z" fill={hair} />
        {/* 눈 */}
        <circle cx="43" cy="45" r="2.1" fill="#2B2B2B" />
        <circle cx="57" cy="45" r="2.1" fill="#2B2B2B" />
        {/* 미소 */}
        <path d="M44 53 C47 57 53 57 56 53" fill="none" stroke="#B5714E" strokeWidth="2" strokeLinecap="round" />
        {glasses && (
          <g fill="none" stroke="#3A3A3A" strokeWidth="1.8">
            <circle cx="43" cy="45" r="5.5" />
            <circle cx="57" cy="45" r="5.5" />
            <line x1="48.5" y1="45" x2="51.5" y2="45" />
          </g>
        )}
      </svg>
    </span>
  )
}
