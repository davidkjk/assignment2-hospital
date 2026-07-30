from fastapi import FastAPI

from app.core.errors import AppError, app_error_handler, unhandled_exception_handler

app = FastAPI(title="Hospital Backend")
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
