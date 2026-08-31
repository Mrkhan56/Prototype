"""
main.py — FastAPI application entry point.
"""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.router import router as auth_router
from config import get_settings
from database import engine
from middleware.redaction import RedactionMiddleware

logger = logging.getLogger("legal_dms")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle manager."""
    # Startup: verify DB connection if available
    try:
        from sqlalchemy import text
        from database import AsyncSessionFactory
        async with AsyncSessionFactory() as session:
            await session.execute(text("SELECT 1"))
        logger.info("✓ Database connected")
    except Exception as exc:
        logger.warning(f"Database offline or unavailable: {exc}. Server running.")
    
    yield
    
    # Shutdown: dispose connection pool
    try:
        await engine.dispose()
        logger.info("✓ Database connections closed")
    except Exception:
        pass


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# ── Middleware (order matters: outermost runs first on request, last on response) ──

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.DEBUG else settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Redaction runs AFTER auth middleware so request.state.user is populated
app.add_middleware(RedactionMiddleware)

# ── Routers ────────────────────────────────────────────────────────────────────

app.include_router(auth_router, prefix="/api/v1")

try:
    from upload.router import router as upload_router
    app.include_router(upload_router, prefix="/api/v1")
except ImportError as e:
    logger.warning(f"Upload router import skipped: {e}")

try:
    from download.router import router as download_router
    app.include_router(download_router, prefix="/api/v1")
except ImportError as e:
    logger.warning(f"Download router import skipped: {e}")

try:
    from search.router import router as search_router
    app.include_router(search_router, prefix="/api/v1")
except ImportError as e:
    logger.warning(f"Search router import skipped: {e}")

try:
    from workflow.router import router as workflow_router
    app.include_router(workflow_router, prefix="/api/v1")
except ImportError as e:
    logger.warning(f"Workflow router import skipped: {e}")


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    """Simple health check for load balancers and clients."""
    return {"status": "ok", "service": settings.APP_NAME, "version": settings.API_VERSION}
