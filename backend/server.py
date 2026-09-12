import os
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from backend.app.db import client, db, shutdown_db_client
from backend.app.auth import router as auth_router
from backend.app.autodesk import router as autodesk_router
from backend.app.projects import router as projects_router
from backend.app.zoning import router as zoning_router
from backend.app.chat import router as chat_router
from backend.app.geodata import router as geodata_router
from backend.app.features import router as features_router
from backend.app.planning import PLANNING_RULES

app = FastAPI(title="SmartScape API")
api_router = APIRouter(prefix="/api")

# Register modular sub-routers
api_router.include_router(auth_router)
api_router.include_router(autodesk_router)
api_router.include_router(projects_router)
api_router.include_router(zoning_router)
api_router.include_router(chat_router)
api_router.include_router(geodata_router)
api_router.include_router(features_router)

@api_router.get("/")
async def root():
    return {"service": "SmartScape API", "version": "1.0.0", "status": "operational"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db():
    await shutdown_db_client()

# Re-exports for backward compatibility
__all__ = ["app", "api_router", "db", "client", "PLANNING_RULES"]
