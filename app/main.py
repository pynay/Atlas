import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import engine, init_db
from app.routes import conversations, videos
from app.services.ingestion import run_polling_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(run_polling_loop(engine))
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Cliff", lifespan=lifespan)
app.include_router(videos.router)
app.include_router(conversations.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
