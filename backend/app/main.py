from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import (
    appointments,
    audit_logs,
    auth_staff,
    dashboard,
    doctor_phrases,
    me,
    medical_records,
    patient_merge,
    patients,
    questionnaire_admin,
    schedule_admin,
    schedule_change,
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
app.include_router(questionnaire_admin.router)
app.include_router(dashboard.router)
app.include_router(stats.router)
app.include_router(schedule_admin.router)
app.include_router(audit_logs.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
