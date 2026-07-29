from fastapi import FastAPI

app = FastAPI(title="Hospital Backend")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
