from flask import Flask, render_template, request, jsonify, session
from flask_pymongo import PyMongo
from flask_cors import CORS
import bcrypt
from bson import ObjectId
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "gta_los_santos_secret_2025")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/los_santos")
app.config["MONGO_URI"] = MONGO_URI
CORS(app, supports_credentials=True)
mongo = PyMongo(app)

# ─── HELPERS ──────────────────────────────────────────────────

def serialize(doc):
    if doc is None:
        return None
    doc = dict(doc)  # make a copy to avoid mutating original
    doc["_id"] = str(doc["_id"])
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, bytes):
            doc[k] = v.decode("utf-8", errors="replace")
        elif isinstance(v, list):
            new_list = []
            for item in v:
                if isinstance(item, dict):
                    new_item = {}
                    for ik, iv in item.items():
                        if isinstance(iv, datetime):
                            new_item[ik] = iv.isoformat()
                        elif isinstance(iv, ObjectId):
                            new_item[ik] = str(iv)
                        else:
                            new_item[ik] = iv
                    new_list.append(new_item)
                else:
                    new_list.append(item)
            doc[k] = new_list
    return doc

def get_empire_tier(cash):
    if cash >= 100000:
        return "Los Santos Legend"
    elif cash >= 10000:
        return "Kingpin"
    return "Street Hustler"

def seed_locations():
    if mongo.db.locations.count_documents({"global": True}) > 0:
        return
    mongo.db.locations.insert_many([
        {"name": "Grove Street HQ",     "type": "safehouse", "lat": 34.052,  "lng": -118.243, "heat": 2,  "earnings": 5000,   "global": True},
        {"name": "Vinewood Heist Zone",  "type": "operation", "lat": 34.092,  "lng": -118.328, "heat": 8,  "earnings": 50000,  "global": True},
        {"name": "LSPD Precinct",        "type": "high_risk", "lat": 34.040,  "lng": -118.260, "heat": 10, "earnings": 0,      "global": True},
        {"name": "Del Perro Pier Drop",  "type": "operation", "lat": 33.985,  "lng": -118.478, "heat": 4,  "earnings": 20000,  "global": True},
        {"name": "Sandy Shores Cache",   "type": "safehouse", "lat": 34.290,  "lng": -117.950, "heat": 1,  "earnings": 8000,   "global": True},
        {"name": "Maze Bank Tower",      "type": "operation", "lat": 34.064,  "lng": -118.252, "heat": 9,  "earnings": 100000, "global": True},
        {"name": "Paleto Bay Stash",     "type": "safehouse", "lat": 34.420,  "lng": -118.510, "heat": 1,  "earnings": 3000,   "global": True},
        {"name": "Mirror Park Turf",     "type": "operation", "lat": 34.075,  "lng": -118.195, "heat": 6,  "earnings": 30000,  "global": True},
        {"name": "LSIA Cargo Zone",      "type": "operation", "lat": 33.942,  "lng": -118.408, "heat": 7,  "earnings": 45000,  "global": True},
        {"name": "Blaine County Cache",  "type": "safehouse", "lat": 34.335,  "lng": -118.025, "heat": 2,  "earnings": 6000,   "global": True},
    ])

# ─── PAGE ROUTES ──────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/signup")
def signup_page():
    return render_template("signup.html")

@app.route("/dashboard")
def dashboard_page():
    if "user_id" not in session:
        return render_template("login.html")
    return render_template("dashboard.html")

# ─── AUTH API ─────────────────────────────────────────────────

@app.route("/api/auth/signup", methods=["POST"])
def signup():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if mongo.db.users.find_one({"username": username}):
        return jsonify({"error": "Username already taken"}), 409

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    user_id = mongo.db.users.insert_one({
        "username": username,
        "password_hash": pw_hash,
        "created_at": datetime.utcnow()
    }).inserted_id

    mongo.db.stats.insert_one({
        "user_id": str(user_id),
        "cash": 0,
        "heat": 0,
        "active_operations": 0,
        "territory": 10,
        "status": "At Large",
        "last_location": "Grove Street",
        "last_seen": datetime.utcnow(),
        "empire_tier": "Street Hustler",
        "missions_completed": 0,
        "missions_failed": 0,
        "cash_history": [],
        "heat_history": [],
        "activity_log": []
    })

    session["user_id"] = str(user_id)
    session["username"] = username
    return jsonify({"message": "Account created", "username": username}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    user = mongo.db.users.find_one({"username": username})
    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401

    session["user_id"] = str(user["_id"])
    session["username"] = user["username"]
    return jsonify({"message": "Login successful", "username": username}), 200


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.route("/api/auth/me", methods=["GET"])
def me():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify({"username": session["username"], "user_id": session["user_id"]}), 200

# ─── DASHBOARD API ────────────────────────────────────────────

@app.route("/api/dashboard", methods=["GET"])
def get_dashboard():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401

    stats = mongo.db.stats.find_one({"user_id": session["user_id"]})
    if not stats:
        return jsonify({"error": "Stats not found"}), 404

    # Heat decay: -1 per 60s when idle
    if stats.get("active_operations", 0) == 0 and stats.get("heat", 0) > 0:
        last = stats.get("last_seen")
        if last and isinstance(last, datetime):
            elapsed = (datetime.utcnow() - last).total_seconds()
            decay = int(elapsed // 60)
            if decay > 0:
                new_heat = max(0, stats["heat"] - decay)
                mongo.db.stats.update_one(
                    {"user_id": session["user_id"]},
                    {"$set": {"heat": new_heat, "last_seen": datetime.utcnow()}}
                )
                stats["heat"] = new_heat

    return jsonify(serialize(stats)), 200

# ─── MISSIONS API ─────────────────────────────────────────────

HEAT_BY_RISK = {"Low": 5, "Medium": 15, "High": 30}

@app.route("/api/missions", methods=["GET"])
def list_missions():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401
    missions = list(mongo.db.missions.find(
        {"user_id": session["user_id"]},
        sort=[("created_at", -1)]
    ))
    return jsonify([serialize(m) for m in missions]), 200


@app.route("/api/missions", methods=["POST"])
def create_mission():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401

    data = request.get_json()
    required = ["name", "type", "location", "risk", "reward", "start_time", "end_time"]
    if not all(k in data for k in required):
        return jsonify({"error": "Missing required fields"}), 400

    # Overlap detection
    active_high_risk = mongo.db.missions.count_documents({
        "user_id": session["user_id"],
        "risk": "High",
        "status": {"$in": ["upcoming", "ongoing"]}
    })
    overlap_warning = active_high_risk > 0 and data["risk"] == "High"

    mission_id = mongo.db.missions.insert_one({
        "user_id":    session["user_id"],
        "name":       data["name"],
        "type":       data["type"],
        "location":   data["location"],
        "risk":       data["risk"],
        "reward":     int(data["reward"]),
        "start_time": data["start_time"],
        "end_time":   data["end_time"],
        "status":     "upcoming",
        "created_at": datetime.utcnow()
    }).inserted_id

    stats = mongo.db.stats.find_one({"user_id": session["user_id"]})
    log_entry = {
        "event": "mission_created",
        "label": f"📋 Planned: {data['name']}",
        "cash":  stats.get("cash", 0),
        "heat":  stats.get("heat", 0),
        "timestamp": datetime.utcnow().isoformat()
    }
    mongo.db.stats.update_one(
        {"user_id": session["user_id"]},
        {
            "$set": {"active_operations": stats.get("active_operations", 0) + 1},
            "$push": {"activity_log": {"$each": [log_entry], "$slice": -50}}
        }
    )
    return jsonify({
        "message": "Mission created",
        "mission_id": str(mission_id),
        "overlap_warning": overlap_warning
    }), 201


@app.route("/api/missions/<mission_id>/complete", methods=["POST"])
def complete_mission(mission_id):
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401

    try:
        mission = mongo.db.missions.find_one({"_id": ObjectId(mission_id)})
    except Exception:
        return jsonify({"error": "Invalid mission ID"}), 400

    if not mission or mission["user_id"] != session["user_id"]:
        return jsonify({"error": "Mission not found"}), 404

    data    = request.get_json()
    success = data.get("success", True)

    mongo.db.missions.update_one(
        {"_id": ObjectId(mission_id)},
        {"$set": {"status": "completed" if success else "failed", "updated_at": datetime.utcnow()}}
    )

    stats     = mongo.db.stats.find_one({"user_id": session["user_id"]})
    heat_inc  = HEAT_BY_RISK.get(mission["risk"], 10)
    new_cash  = stats.get("cash", 0) + (mission["reward"] if success else 0)
    new_heat  = min(100, stats.get("heat", 0) + (heat_inc if success else heat_inc // 2))
    new_ops   = max(0, stats.get("active_operations", 1) - 1)
    mc        = stats.get("missions_completed", 0) + (1 if success else 0)
    mf        = stats.get("missions_failed", 0) + (0 if success else 1)
    tier      = get_empire_tier(new_cash)
    territory = min(100, stats.get("territory", 10) + (2 if success else 0))

    log_entry = {
        "event":     "completed" if success else "failed",
        "label":     f"✓ {mission['name']} +${mission['reward']:,}" if success else f"✗ {mission['name']} — Failed",
        "cash":      new_cash,
        "heat":      new_heat,
        "timestamp": datetime.utcnow().isoformat()
    }

    mongo.db.stats.update_one(
        {"user_id": session["user_id"]},
        {
            "$set": {
                "cash": new_cash, "heat": new_heat,
                "active_operations": new_ops, "empire_tier": tier,
                "missions_completed": mc, "missions_failed": mf,
                "territory": territory, "last_seen": datetime.utcnow()
            },
            "$push": {
                "cash_history": {"$each": [{"amount": new_cash, "timestamp": datetime.utcnow().isoformat()}], "$slice": -50},
                "heat_history": {"$each": [{"heat": new_heat,   "timestamp": datetime.utcnow().isoformat()}], "$slice": -50},
                "activity_log": {"$each": [log_entry], "$slice": -50}
            }
        }
    )

    return jsonify({
        "message": "Mission updated",
        "success": success,
        "new_cash": new_cash,
        "new_heat": new_heat,
        "empire_tier": tier
    }), 200
 
# ─── ACTIVITY REPLAY ─────────────────────────────────────────

@app.route("/api/replay", methods=["GET"])
def get_replay():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401
    stats = mongo.db.stats.find_one({"user_id": session["user_id"]})
    if not stats:
        return jsonify([]), 200
    return jsonify(stats.get("activity_log", [])), 200

# ─── LEADERBOARD ─────────────────────────────────────────────

@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401

    top = list(mongo.db.stats.find(
        {}, {"cash": 1, "empire_tier": 1, "missions_completed": 1, "territory": 1, "user_id": 1}
    ).sort("cash", -1).limit(10))

    result = []
    for s in top:
        try:
            user = mongo.db.users.find_one({"_id": ObjectId(s["user_id"])})
            name = user["username"] if user else "Unknown"
        except Exception:
            name = "Unknown"
        result.append({
            "username":           name,
            "cash":               s.get("cash", 0),
            "empire_tier":        s.get("empire_tier", "Street Hustler"),
            "missions_completed": s.get("missions_completed", 0),
            "territory":          s.get("territory", 0),
            "is_me":              s.get("user_id") == session.get("user_id", "")
        })
    return jsonify(result), 200

# ─── MAP API ──────────────────────────────────────────────────

@app.route("/api/map/locations", methods=["GET"])
def get_locations():
    if "user_id" not in session:
        return jsonify({"error": "Not authenticated"}), 401
    seed_locations()
    locs = list(mongo.db.locations.find({
        "$or": [{"user_id": session["user_id"]}, {"global": True}]
    }))
    return jsonify([serialize(l) for l in locs]), 200

# ─── PREDICT HEAT ─────────────────────────────────────────────

@app.route("/api/predict-heat", methods=["POST"])
def predict_heat():
    data         = request.get_json()
    risk         = data.get("risk", "Medium")
    reward       = int(data.get("reward", 10000))
    active_ops   = int(data.get("active_operations", 0))

    base          = HEAT_BY_RISK.get(risk, 15)
    overlap_bonus = active_ops * 5
    reward_factor = min(20, reward // 5000)
    predicted     = base + overlap_bonus + reward_factor

    return jsonify({"predicted_heat_increase": min(100, predicted)}), 200

# ─── HEALTH CHECK ─────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()}), 200

if __name__ == "__main__":
    app.run(debug=True, port=5000, use_reloader=False)