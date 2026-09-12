from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 별칭 주의: 아래 `from app.routers import (... settings ...)`가 이름 `settings`를 라우터
# 모듈로 재바인딩하므로, 설정 객체는 충돌을 피해 별칭으로 가져온다.
from app.core.config import settings as app_settings
from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import (
    admin_chat,
    appointments,
    audit_logs,
    auth_staff,
    chat,
    dashboard,
    doctor_phrases,
    error_logs,
    me,
    medical_records,
    messages,
    patient_appointments,
    patient_bookings,
    patient_catalog,
    patient_consent,
    patient_device_tokens,
    patient_family,
    patient_merge,
    patient_notifications,
    patient_password_reset,
    patient_profile,
    patient_settings,
    patients,
    questionnaire_admin,
    schedule_admin,
    schedule_change,
    settings,
    staff,
    staff_chat,
    stats,
)

app = FastAPI(title="Hospital Backend")

# 브라우저 CORS — Vercel 직원 웹·webchat이 이 백엔드를 호출할 수 있게 한다(배포 Task 14).
# 허용 오리진은 ALLOWED_ORIGINS 환경변수(콤마구분)로 주입된다. 비면 아무 브라우저 오리진도
# 허용하지 않는다(모바일 앱은 네이티브라 CORS 무관).
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(staff.router)
app.include_router(auth_staff.router)
app.include_router(appointments.router)
app.include_router(medical_records.router)
app.include_router(doctor_phrases.router)
app.include_router(schedule_change.router)
app.include_router(me.router)
app.include_router(patients.router)
app.include_router(patient_merge.router)
# 환자앱(3단계) 라우터 — /patients·/family·/catalog·/bookings·/my·/device-tokens (직원 경로와 겹치지 않음)
app.include_router(patient_profile.router)
app.include_router(patient_consent.router)
app.include_router(patient_password_reset.router)
app.include_router(patient_family.router)
app.include_router(patient_catalog.router)
app.include_router(patient_settings.router)
app.include_router(patient_bookings.router)
app.include_router(patient_appointments.router)
app.include_router(patient_device_tokens.router)
app.include_router(patient_notifications.router)
app.include_router(questionnaire_admin.router)
app.include_router(dashboard.router)
app.include_router(stats.router)
app.include_router(schedule_admin.router)
app.include_router(audit_logs.router)
app.include_router(error_logs.router)
app.include_router(messages.router)
app.include_router(chat.router)
app.include_router(staff_chat.router)
app.include_router(staff_chat.directory_router)   # GET /staff/active (이관 대상)
app.include_router(admin_chat.router)
app.include_router(settings.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
