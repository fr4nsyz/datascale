"""dataTail AI Service -- FastAPI entry point.

Runs MobileSAM and CLIP locally on Apple Silicon (MPS backend).
Start with:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import agents, clip_routes, segment

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-24s  %(levelname)-8s  %(message)s",
)
logger = logging.getLogger("dataTail")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="dataTail AI Service",
    description="MobileSAM + CLIP inference service for the dataTail annotation platform.",
    version="0.1.0",
)

# ---------------------------------------------------------------------------
# CORS -- allow the local dev client and any Tailscale tailnet origins
# ---------------------------------------------------------------------------

_TAILNET_ORIGIN_RE = re.compile(r"^https?://[a-zA-Z0-9\-]+\.ts\.net(:\d+)?$")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://[a-zA-Z0-9\-]+\.ts\.net(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(segment.router)
app.include_router(clip_routes.router)
app.include_router(agents.router)

# ---------------------------------------------------------------------------
# Startup -- preload models
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def startup_load_models() -> None:
    """Load MobileSAM and CLIP models into memory at startup."""
    from models import load_all_models

    logger.info("Loading AI models ...")
    load_all_models()
    logger.info("AI models ready.")


# ---------------------------------------------------------------------------
# Health-check
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok"}
