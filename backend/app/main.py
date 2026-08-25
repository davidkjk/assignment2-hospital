from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import (
    appointments,
    auth_staff,
    doctor_phrases,
    me,
    medical_records,
    schedule_change,
    staff,
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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
