from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import (
    appointments,
    audit_logs,
    auth_staff,
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
    patient_password_reset,
    patient_profile,
    patients,
    questionnaire_admin,
    schedule_admin,
    schedule_change,
    settings,
    staff,
    stats,
)

app = FastAPI(title="Hospital Backend")
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
app.include_router(patient_bookings.router)
app.include_router(patient_appointments.router)
app.include_router(patient_device_tokens.router)
app.include_router(questionnaire_admin.router)
app.include_router(dashboard.router)
app.include_router(stats.router)
app.include_router(schedule_admin.router)
app.include_router(audit_logs.router)
app.include_router(error_logs.router)
app.include_router(messages.router)
app.include_router(settings.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
