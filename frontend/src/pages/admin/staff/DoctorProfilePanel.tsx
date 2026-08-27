import { useEffect, useState, type CSSProperties, type MutableRefObject } from 'react'
import { BusyButton } from '../../../components/BusyButton'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { staffApi, type ProfilePatch, type StaffMember } from '../../../api/staff'
import { PalettePicker } from './PalettePicker'

// [STAFF-PROFILE-01~11·CAL-COLOR-*] 의사 프로필 편집 — 오른쪽 칸을 잠시 빌려 쓴다.
// ⭐ 넷만 고친다: 사진·전문분야·소개글·캘린더 색(이름·역할·소속은 계정 정보라 여기서 안 고침).
// ⭐ 사진 없으면 회색 원 + 이름 첫 글자(BOOK-DOC-05와 같은 그림). 사진 지우기는 확인창 안에서만.
// ⭐ 저장은 바뀐 칸만 보낸다(CAL-COLOR-09는 색값이 아니라 팔레트 번호).

interface Baseline {
  specialty: string
  bio: string
  color: number | null
}

interface DoctorProfilePanelProps {
  doctor: StaffMember
  allStaff: StaffMember[]
  onClose(): void
  onSaved(): void
  onDirtyChange(dirty: boolean): void
  /** 떠날 때 묻기의 [저장]이 부를 수 있게 최신 저장 함수를 심어 둔다(STAFF-PROFILE-09). */
  saveRef?: MutableRefObject<(() => Promise<void>) | null>
}

function baselineOf(doctor: StaffMember): Baseline {
  return { specialty: doctor.specialty ?? '', bio: doctor.bio ?? '', color: doctor.calendar_color_index }
}

export function DoctorProfilePanel({ doctor, allStaff, onClose, onSaved, onDirtyChange, saveRef }: DoctorProfilePanelProps) {
  const [baseline, setBaseline] = useState<Baseline>(() => baselineOf(doctor))
  const [specialty, setSpecialty] = useState(baseline.specialty)
  const [bio, setBio] = useState(baseline.bio)
  const [color, setColor] = useState<number | null>(baseline.color)
  const [photoUrl, setPhotoUrl] = useState<string | null>(doctor.photo_url)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // 다른 의사로 갈아타면(STAFF-PROFILE-03) 그 사람 값으로 다시 채운다.
  useEffect(() => {
    const b = baselineOf(doctor)
    setBaseline(b)
    setSpecialty(b.specialty)
    setBio(b.bio)
    setColor(b.color)
    setPhotoUrl(doctor.photo_url)
  }, [doctor])

  const dirty = specialty !== baseline.specialty || bio !== baseline.bio || color !== baseline.color

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  async function save() {
    const patch: ProfilePatch = {}
    if (specialty !== baseline.specialty) patch.specialty = specialty
    if (bio !== baseline.bio) patch.bio = bio
    if (color !== baseline.color && color !== null) patch.calendar_color_index = color
    if (Object.keys(patch).length > 0) await staffApi.updateProfile(doctor.id, patch)
    setBaseline({ specialty, bio, color })
    onSaved()
  }

  useEffect(() => {
    if (saveRef) saveRef.current = save
  })

  async function confirmDeletePhoto() {
    setConfirmingDelete(false)
    await staffApi.deletePhoto(doctor.id)
    setPhotoUrl(null)
    onSaved()
  }

  const others = allStaff.filter(
    (m) => m.id !== doctor.id && m.role === 'doctor' && m.is_active && m.calendar_color_index != null,
  )
  const usedIndices = others.map((m) => m.calendar_color_index as number)
  const conflictIndices = others
    .filter((m) => m.department_id === doctor.department_id)
    .map((m) => m.calendar_color_index as number)

  return (
    <aside role="complementary" aria-label="의사 프로필" style={styles.panel}>
      <div style={styles.head}>
        <h2 style={styles.title}>{doctor.name} 선생님 프로필</h2>
        <button type="button" onClick={onClose} style={styles.close}>
          닫기
        </button>
      </div>

      <div data-field="사진" style={styles.field}>
        <span style={styles.fieldLabel}>사진</span>
        <div style={styles.photoRow}>
          <div data-testid="doctor-avatar" style={styles.avatar}>
            {photoUrl ? (
              <img src={photoUrl} alt={`${doctor.name} 사진`} style={styles.avatarImg} />
            ) : (
              <span aria-hidden="true">{doctor.name.slice(0, 1)}</span>
            )}
          </div>
          <div style={styles.photoActions}>
            <label style={styles.uploadBtn}>
              사진 바꾸기
              <input
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const { photo_url } = await staffApi.uploadPhoto(doctor.id, file)
                  setPhotoUrl(photo_url)
                  onSaved()
                }}
              />
            </label>
            <span style={styles.hint}>JPG·PNG · 5MB까지</span>
            {photoUrl && (
              <button type="button" onClick={() => setConfirmingDelete(true)} style={styles.deletePhoto}>
                사진 지우기
              </button>
            )}
          </div>
        </div>
      </div>

      <label data-field="전문분야" style={styles.field}>
        <span style={styles.fieldLabel}>전문분야</span>
        <input
          type="text"
          aria-label="전문분야"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          style={styles.input}
        />
        <span data-help style={styles.help}>
          환자 앱 의사 선택 화면에 그대로 보입니다
        </span>
      </label>

      <label data-field="소개글" style={styles.field}>
        <span style={styles.fieldLabel}>소개글</span>
        <textarea
          aria-label="소개글"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          style={styles.textarea}
        />
        <span data-help style={styles.help}>
          환자 화면에는 나오지 않습니다 · 상담봇이 답할 때 씁니다
        </span>
      </label>

      <div data-field="캘린더 색" style={styles.field}>
        <span style={styles.fieldLabel}>캘린더 색</span>
        <PalettePicker
          value={color}
          onChange={setColor}
          usedIndices={usedIndices}
          conflictIndices={conflictIndices}
        />
      </div>

      <div style={styles.actions}>
        <BusyButton label="저장" busyLabel="저장하는 중…" onClick={save} />
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="사진을 지울까요?"
          message="지우면 회색 원 + 이름 첫 글자로 돌아갑니다. 되살리려면 다시 올려야 합니다."
          confirmLabel="지우기"
          cancelLabel="취소"
          danger
          onConfirm={() => void confirmDeletePhoto()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </aside>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: { display: 'flex', flexDirection: 'column', gap: 16 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--color-ink)' },
  close: {
    height: 30,
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldLabel: { fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--color-ink)' },
  photoRow: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-divider)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 'var(--fs-lg)',
    fontWeight: 700,
    color: 'var(--color-ink-muted)',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  photoActions: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  uploadBtn: {
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 12px',
    borderRadius: 7,
    border: '1px solid var(--color-primary)',
    background: 'var(--color-surface)',
    color: 'var(--color-primary)',
    fontSize: 'var(--fs-sm)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  hint: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  deletePhoto: {
    border: 'none',
    background: 'none',
    color: 'var(--color-ink-muted)',
    fontSize: 'var(--fs-sm)',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: 0,
  },
  input: {
    height: 34,
    padding: '0 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
  },
  textarea: {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--color-divider)',
    background: 'var(--color-surface)',
    color: 'var(--color-ink)',
    fontSize: 'var(--fs-base)',
    resize: 'vertical',
  },
  help: { fontSize: 'var(--fs-sm)', color: 'var(--color-ink-muted)' },
  actions: { display: 'flex', gap: 8, marginTop: 2 },
}
