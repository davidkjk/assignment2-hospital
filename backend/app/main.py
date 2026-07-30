from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler
from app.routers import appointments, medical_records, staff

app = FastAPI(title="Hospital Backend")
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(staff.router)
app.include_router(appointments.router)
app.include_router(medical_records.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
