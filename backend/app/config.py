import os
import logging
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / '.env')

# Mongo
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')

# JWT & Session
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 30

EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7

# Autodesk Platform Services
APS_CLIENT_ID = os.environ.get('APS_CLIENT_ID')
APS_CLIENT_SECRET = os.environ.get('APS_CLIENT_SECRET')
APS_CALLBACK_URL = os.environ.get('APS_CALLBACK_URL')
APS_BASE = "https://developer.api.autodesk.com"
APS_SCOPES = "data:read data:write data:create account:read user:read openid"

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smartscape")
