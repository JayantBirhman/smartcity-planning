from motor.motor_asyncio import AsyncIOMotorClient
from backend.app.config import MONGO_URL, DB_NAME

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

async def shutdown_db_client():
    client.close()
