import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.routes import videos


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Cliff", lifespan=lifespan)
app.include_router(videos.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
