"""배포된 클라우드 환경 스모크 테스트 (재배포 때마다 재실행 가능).

실행 예:
    cd backend
    SMOKE_API=https://gaonhospital-api-production.up.railway.app \
    SMOKE_SUPABASE_URL=https://eebhfnguwdjdusafrain.supabase.co \
    SMOKE_ANON_KEY=<supabase anon key> \
    python -m scripts.smoke

선택 환경변수:
    SMOKE_STAFF_EMAIL / SMOKE_STAFF_PASSWORD  (기본: admin@gaon.local / demo1234)
    SMOKE_PATIENT_PHONE / SMOKE_PATIENT_PASSWORD
        환자 로그인 검증을 켠다. 값이 없으면 환자 구간은 건너뛴다.
        (원격 시드의 patients는 auth_user_id 연결 전이라, SP2로 데모 환자 auth가
         생성된 뒤에만 이 구간이 통과한다. 예: +821012345678 / demo1234)

주의:
  - 이 배포는 **same-origin 프록시** 방식이라(브라우저→Vercel→Railway rewrite),
    브라우저가 Railway로 교차출처 요청을 하지 않는다 → CORS(ALLOWED_ORIGINS)는
    비어 있는 것이 정상이며, 플랜 초안에 있던 CORS preflight 검증은 제거했다.
  - 라우트 경로는 실제 라우터 기준으로 맞췄다(플랜 초안의 /today-summary·
    /app/departments·/app/appointments 표기는 낡음 → /today/summary·
    /catalog/departments·/my/appointments).
"""
import os
import sys

import httpx

API = os.environ["SMOKE_API"].rstrip("/")
SUPABASE = os.environ["SMOKE_SUPABASE_URL"].rstrip("/")
ANON = os.environ["SMOKE_ANON_KEY"]

STAFF = {
    "email": os.environ.get("SMOKE_STAFF_EMAIL", "admin@gaon.local"),
    "password": os.environ.get("SMOKE_STAFF_PASSWORD", "demo1234"),
}
PATIENT_PHONE = os.environ.get("SMOKE_PATIENT_PHONE")
PATIENT_PASSWORD = os.environ.get("SMOKE_PATIENT_PASSWORD", "demo1234")


def login(payload: dict) -> str:
    res = httpx.post(
        f"{SUPABASE}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON},
        json=payload,
        timeout=15,
    )
    res.raise_for_status()
    return res.json()["access_token"]


def check(name: str, ok: bool, detail: str = ""):
    print(f"{'✅' if ok else '❌'} {name} {detail}")
    if not ok:
        sys.exit(1)


def main():
    # 1) 헬스체크
    res = httpx.get(f"{API}/health", timeout=15)
    check("health", res.status_code == 200)

    # 2) 직원 로그인(Supabase Auth) → 백엔드가 그 토큰을 받아들이는지(/me)
    staff_token = login(STAFF)
    sh = {"Authorization": f"Bearer {staff_token}"}
    res = httpx.get(f"{API}/me", headers=sh, timeout=15)
    check("직원 로그인 + /me", res.status_code == 200)

    # 3) 오늘의 현황(대시보드)
    res = httpx.get(f"{API}/today/summary", headers=sh, timeout=15)
    check("오늘의 현황(/today/summary)", res.status_code == 200)

    # 4) 미인증 차단(직원 전용 API를 토큰 없이)
    res = httpx.get(f"{API}/error-logs", timeout=15)
    check("미인증 차단(/error-logs)", res.status_code == 401)

    # 5) (선택) 환자 로그인 구간 — SP2로 데모 환자 auth가 생성된 뒤에만 켠다
    if PATIENT_PHONE:
        patient_token = login({"phone": PATIENT_PHONE, "password": PATIENT_PASSWORD})
        ph = {"Authorization": f"Bearer {patient_token}"}

        res = httpx.get(f"{API}/catalog/departments", headers=ph, timeout=15)
        check("환자 진료과 조회(/catalog/departments)",
              res.status_code == 200 and len(res.json()) >= 3,
              f"count={len(res.json()) if res.status_code == 200 else '-'}")

        res = httpx.get(f"{API}/my/appointments", headers=ph, timeout=15)
        check("환자 예약 목록(/my/appointments)", res.status_code == 200)

        # 권한 경계: 환자 토큰으로 직원 API는 막혀야 한다
        res = httpx.get(f"{API}/today/summary", headers=ph, timeout=15)
        check("환자→직원 API 차단", res.status_code in (401, 403))
    else:
        print("⏭️  환자 구간 건너뜀 (SMOKE_PATIENT_PHONE 미설정 — SP2 데모 환자 auth 생성 후 설정)")

    print("스모크 테스트 전체 통과")


if __name__ == "__main__":
    main()
