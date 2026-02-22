import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "gta_los_santos_secret_2025")
    MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/los_santos")
    DEBUG = os.getenv("DEBUG", "True") == "True"
