import os
import sys
import json
import math
import traceback
from datetime import datetime

from flask import Flask, render_template, request, jsonify

# --- Model Loading ---
try:
    import joblib
    import numpy as np
    import pandas as pd
except ImportError as e:
    print(f"[ERROR] Required package missing: {e}")
    print("  Run: pip install -r requirements.txt")
    sys.exit(1)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Load the trained model at startup
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(__file__), "apsrtc_demand_model.pkl")

if not os.path.exists(MODEL_PATH):
    print("=" * 60)
    print("[ERROR] Model file 'apsrtc_demand_model.pkl' NOT FOUND!")
    print(f"  Expected path: {MODEL_PATH}")
    print("  Place the model file in the same directory as app.py and restart.")
    print("=" * 60)
    sys.exit(1)

try:
    model = joblib.load(MODEL_PATH)
    print(f"[OK] APSRTC ML Model loaded successfully from: {MODEL_PATH}")
except Exception as e:
    print("=" * 60)
    print(f"[ERROR] Failed to load model from {MODEL_PATH}: {e}")
    traceback.print_exc()
    print("=" * 60)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Static reference data – routes, operational frequencies & corridor profiles
# ---------------------------------------------------------------------------
ROUTES_CONFIG = [
    {
        "route": "Hyderabad-Vijayawada",
        "depot": "Hyderabad",
        "distance_km": 275,
        "fare_per_passenger": 300,
        "base_demand": 190,
        "daily_frequency": "Every 30 mins (16 departures/day)",
        "frequency_multiplier": 4.5,
        "corridor_type": "High-Density Express Corridor",
    },
    {
        "route": "Hyderabad-Visakhapatnam",
        "depot": "Hyderabad",
        "distance_km": 620,
        "fare_per_passenger": 650,
        "base_demand": 210,
        "daily_frequency": "Every 45 mins (12 departures/day)",
        "frequency_multiplier": 5.0,
        "corridor_type": "Long-Haul Trunk Corridor",
    },
    {
        "route": "Hyderabad-Tirupati",
        "depot": "Hyderabad",
        "distance_km": 560,
        "fare_per_passenger": 600,
        "base_demand": 175,
        "daily_frequency": "Every 45 mins (10 departures/day)",
        "frequency_multiplier": 4.2,
        "corridor_type": "Pilgrim High-Demand Corridor",
    },
    {
        "route": "Guntur-Hyderabad",
        "depot": "Guntur",
        "distance_km": 285,
        "fare_per_passenger": 310,
        "base_demand": 160,
        "daily_frequency": "Every 40 mins (14 departures/day)",
        "frequency_multiplier": 3.8,
        "corridor_type": "Inter-City Commercial Corridor",
    },
    {
        "route": "Vijayawada-Visakhapatnam",
        "depot": "Vijayawada",
        "distance_km": 350,
        "fare_per_passenger": 380,
        "base_demand": 180,
        "daily_frequency": "Every 40 mins (12 departures/day)",
        "frequency_multiplier": 4.0,
        "corridor_type": "Coastal Trunk Corridor",
    },
    {
        "route": "Nellore-Chennai",
        "depot": "Nellore",
        "distance_km": 175,
        "fare_per_passenger": 190,
        "base_demand": 170,
        "daily_frequency": "Every 30 mins (18 departures/day)",
        "frequency_multiplier": 4.2,
        "corridor_type": "Inter-State Commuter Corridor",
    },
    {
        "route": "Rajahmundry-Hyderabad",
        "depot": "Visakhapatnam",
        "distance_km": 430,
        "fare_per_passenger": 460,
        "base_demand": 165,
        "daily_frequency": "Every 1 hr (8 departures/day)",
        "frequency_multiplier": 3.6,
        "corridor_type": "Regional Highway Corridor",
    },
    {
        "route": "Vijayawada-Tirupati",
        "depot": "Vijayawada",
        "distance_km": 380,
        "fare_per_passenger": 400,
        "base_demand": 155,
        "daily_frequency": "Every 1 hr (8 departures/day)",
        "frequency_multiplier": 3.4,
        "corridor_type": "Pilgrim Transit Corridor",
    },
    {
        "route": "Ongole-Hyderabad",
        "depot": "Guntur",
        "distance_km": 310,
        "fare_per_passenger": 330,
        "base_demand": 150,
        "daily_frequency": "Every 1.5 hrs (8 departures/day)",
        "frequency_multiplier": 3.2,
        "corridor_type": "Regional Corridor",
    },
    {
        "route": "Kurnool-Hyderabad",
        "depot": "Kurnool",
        "distance_km": 215,
        "fare_per_passenger": 240,
        "base_demand": 145,
        "daily_frequency": "Every 1 hr (10 departures/day)",
        "frequency_multiplier": 3.0,
        "corridor_type": "Rayalaseema Express Route",
    },
    {
        "route": "Eluru-Hyderabad",
        "depot": "Vijayawada",
        "distance_km": 330,
        "fare_per_passenger": 350,
        "base_demand": 140,
        "daily_frequency": "Every 2 hrs (6 departures/day)",
        "frequency_multiplier": 2.8,
        "corridor_type": "Connecting Feeder Route",
    },
    {
        "route": "Anantapur-Bangalore",
        "depot": "Kurnool",
        "distance_km": 215,
        "fare_per_passenger": 230,
        "base_demand": 135,
        "daily_frequency": "Every 1 hr (10 departures/day)",
        "frequency_multiplier": 2.7,
        "corridor_type": "Inter-State Express Corridor",
    },
    {
        "route": "Kadapa-Hyderabad",
        "depot": "Hyderabad",
        "distance_km": 410,
        "fare_per_passenger": 450,
        "base_demand": 130,
        "daily_frequency": "Every 2 hrs (6 departures/day)",
        "frequency_multiplier": 2.5,
        "corridor_type": "Rayalaseema Connector",
    },
    {
        "route": "Kakinada-Vijayawada",
        "depot": "Vijayawada",
        "distance_km": 210,
        "fare_per_passenger": 230,
        "base_demand": 125,
        "daily_frequency": "Every 1 hr (10 departures/day)",
        "frequency_multiplier": 2.4,
        "corridor_type": "Coastal Feeder Route",
    },
    {
        "route": "Chittoor-Bangalore",
        "depot": "Tirupati",
        "distance_km": 180,
        "fare_per_passenger": 190,
        "base_demand": 120,
        "daily_frequency": "Every 1.5 hrs (8 departures/day)",
        "frequency_multiplier": 2.2,
        "corridor_type": "Border Commuter Route",
    },
]

BUS_TYPES = ["Express", "Ordinary", "Semi-Sleeper", "Super Luxury", "Sleeper", "Volvo AC"]
BUS_CAPACITIES = {
    "Ordinary": 55,
    "Express": 52,
    "Semi-Sleeper": 48,
    "Super Luxury": 44,
    "Volvo AC": 42,
    "Sleeper": 36,
}

DEPOTS = ["Guntur", "Hyderabad", "Kurnool", "Nellore", "Tirupati", "Vijayawada", "Visakhapatnam"]

ROUTE_DATA_MAP = {r["route"]: r for r in ROUTES_CONFIG}


def build_features(route, bus_type, depot, capacity, distance_km,
                   fare_per_passenger, date_obj,
                   previous_passengers=None,
                   previous_3_avg=None,
                   previous_5_avg=None,
                   previous_7_avg=None,
                   route_avg_demand=None):
    """Build the exact feature DataFrame expected by the ML model pipeline."""

    base_demand = ROUTE_DATA_MAP.get(route, {}).get("base_demand", 150)
    route_avg = float(route_avg_demand) if route_avg_demand is not None else float(base_demand)

    # Intelligently propagate previous trend if provided
    if previous_passengers is not None:
        p = float(previous_passengers)
        prev_pass  = p
        prev_3_avg = float(previous_3_avg) if previous_3_avg is not None else p
        prev_5_avg = float(previous_5_avg) if previous_5_avg is not None else p
        prev_7_avg = float(previous_7_avg) if previous_7_avg is not None else p
        route_avg  = p
    else:
        prev_pass  = float(route_avg)
        prev_3_avg = float(route_avg)
        prev_5_avg = float(route_avg)
        prev_7_avg = float(route_avg)

    # Format temporal attributes to match trained model pipeline
    month_name = date_obj.strftime("%B")        # 'January', 'August', etc.
    day_name   = date_obj.strftime("%A")        # 'Monday', 'Saturday', etc.
    day_of_year = date_obj.timetuple().tm_yday  # 1..366
    week_of_year = int(date_obj.strftime("%W")) # 0..53

    features = {
        "route":                str(route),
        "bus_type":             str(bus_type),
        "depot":                str(depot),
        "capacity":             int(capacity),
        "distance_km":          float(distance_km),
        "fare_per_passenger":   float(fare_per_passenger),
        "month":                str(month_name),
        "day_of_week":          str(day_name),
        "day_of_year":          int(day_of_year),
        "week_of_year":         int(week_of_year),
        "previous_passengers":  float(prev_pass),
        "previous_3_avg":       float(prev_3_avg),
        "previous_5_avg":       float(prev_5_avg),
        "previous_7_avg":       float(prev_7_avg),
        "route_avg_demand":     float(route_avg),
    }
    return pd.DataFrame([features])


def demand_level(occupancy_pct):
    """Classify demand based on predicted occupancy percentage."""
    if occupancy_pct >= 80.0:
        return "HIGH"
    elif occupancy_pct >= 50.0:
        return "MEDIUM"
    return "LOW"


def recommended_buses(predicted_passengers, capacity):
    """Calculate recommended number of buses to satisfy demand."""
    if capacity <= 0:
        return 1
    return max(1, math.ceil(predicted_passengers / capacity))


# ---------------------------------------------------------------------------
# HTML Page Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/prediction")
def prediction_page():
    return render_template("prediction.html",
                           routes=[r["route"] for r in ROUTES_CONFIG],
                           bus_types=BUS_TYPES,
                           depots=DEPOTS,
                           bus_capacities=BUS_CAPACITIES,
                           route_data=ROUTE_DATA_MAP)


@app.route("/optimization")
def optimization_page():
    return render_template("optimization.html",
                           routes=[r["route"] for r in ROUTES_CONFIG])


@app.route("/dashboard")
def dashboard_page():
    return render_template("dashboard.html",
                           bus_types=BUS_TYPES)


# ---------------------------------------------------------------------------
# API: Predict Demand for Single Trip
# ---------------------------------------------------------------------------
@app.route("/api/predict", methods=["POST"])
def api_predict():
    try:
        data = request.get_json(force=True)

        route            = data.get("route", "Hyderabad-Vijayawada")
        bus_type         = data.get("bus_type", "Express")
        depot            = data.get("depot", "Hyderabad")
        capacity         = int(data.get("capacity", 52))
        distance_km      = float(data.get("distance_km", 275))
        fare             = float(data.get("fare_per_passenger", 300))
        date_str         = data.get("date", datetime.today().strftime("%Y-%m-%d"))

        prev_pass  = data.get("previous_passengers")
        prev_3_avg = data.get("previous_3_avg")
        prev_5_avg = data.get("previous_5_avg")
        prev_7_avg = data.get("previous_7_avg")
        route_avg  = data.get("route_avg_demand")

        date_obj = datetime.strptime(date_str, "%Y-%m-%d")

        X = build_features(route, bus_type, depot, capacity, distance_km, fare, date_obj,
                           prev_pass, prev_3_avg, prev_5_avg, prev_7_avg, route_avg)

        # Make prediction with the trained model
        pred_raw = float(model.predict(X)[0])
        predicted = max(1, round(pred_raw))

        occupancy = round((predicted / max(capacity, 1)) * 100, 1)
        level = demand_level(occupancy)
        buses = recommended_buses(predicted, capacity)

        route_info = ROUTE_DATA_MAP.get(route, {})
        freq_str = route_info.get("daily_frequency", "Every 45 mins")

        return jsonify({
            "success":              True,
            "predicted_passengers": predicted,
            "occupancy_pct":        occupancy,
            "demand_level":         level,
            "recommended_buses":    buses,
            "route":                route,
            "bus_type":             bus_type,
            "depot":                depot,
            "capacity":             capacity,
            "distance_km":          distance_km,
            "fare_per_passenger":   fare,
            "date":                 date_str,
            "daily_frequency":      freq_str,
            "estimated_revenue":    round(predicted * fare, 2),
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------------------------
# API: Fleet Optimization (Greedy Demand-Pressure Algorithm with Frequency)
# ---------------------------------------------------------------------------
@app.route("/api/optimize", methods=["POST"])
def api_optimize():
    try:
        data        = request.get_json(force=True)
        total_buses = int(data.get("total_buses", 30))
        date_str    = data.get("date", datetime.today().strftime("%Y-%m-%d"))
        selected_bus_type = data.get("bus_type", "Express")
        date_obj    = datetime.strptime(date_str, "%Y-%m-%d")

        capacity = BUS_CAPACITIES.get(selected_bus_type, 52)
        route_results = []

        # Predict passenger demand for all routes using ML model
        for r in ROUTES_CONFIG:
            route        = r["route"]
            depot        = r["depot"]
            distance_km  = r["distance_km"]
            fare         = r["fare_per_passenger"]
            base_demand  = r.get("base_demand", 150)
            freq_str     = r.get("daily_frequency", "Every 1 hr (8 departures/day)")
            freq_mult    = r.get("frequency_multiplier", 3.0)
            corridor_type = r.get("corridor_type", "Inter-City Route")

            X = build_features(route, selected_bus_type, depot, capacity, distance_km, fare, date_obj,
                               base_demand, base_demand, base_demand, base_demand, base_demand)
            
            # Single trip ML demand prediction
            single_pred = max(1, round(float(model.predict(X)[0])))
            
            # Total volume demand accounting for daily corridor frequency
            total_corridor_demand = round(single_pred * freq_mult)

            route_results.append({
                "route":                  route,
                "depot":                  depot,
                "single_trip_predicted":  single_pred,
                "predicted_passengers":   total_corridor_demand,
                "capacity":               capacity,
                "distance_km":            distance_km,
                "fare":                   fare,
                "daily_frequency":        freq_str,
                "freq_mult":              freq_mult,
                "corridor_type":          corridor_type,
            })

        # ── Greedy Dynamic Bus Allocation ────────────────────────────
        n = len(route_results)
        # Baseline minimum service: 1 bus per route if total_buses >= n
        if total_buses >= n:
            allocated = [1] * n
            buses_remaining = total_buses - n
        else:
            allocated = [1 if i < total_buses else 0 for i in range(n)]
            buses_remaining = 0

        # Iteratively assign additional buses to route with highest demand pressure
        while buses_remaining > 0:
            pressures = []
            for i, r in enumerate(route_results):
                # Capacity provided by allocated buses across their daily trips
                alloc_cap = max(allocated[i] * r["capacity"] * 2, 1)  # 2 trips/day per bus baseline
                pressure = r["predicted_passengers"] / alloc_cap
                pressures.append(pressure)

            best_idx = pressures.index(max(pressures))
            allocated[best_idx] += 1
            buses_remaining -= 1

        # Build comprehensive results with Frequency and Allocation Rationale
        total_predicted = sum(r["predicted_passengers"] for r in route_results)
        output_routes = []

        for i, r in enumerate(route_results):
            buses_count = allocated[i]
            # Total seat capacity provided per day by allocated fleet
            alloc_cap = buses_count * r["capacity"] * 2
            utilization = round((r["predicted_passengers"] / max(alloc_cap, 1)) * 100, 1)
            level = demand_level(utilization)

            # Human-readable explanation of why 1, 2, or 3+ buses are allocated
            if buses_count >= 3:
                reason = f"Heavy trunk volume ({r['predicted_passengers']} pass/day): 3+ buses required to sustain {r['daily_frequency']} without overcrowding."
                recommendation = "Deploy 3+ buses · High frequency trunk"
            elif buses_count == 2:
                reason = f"High demand pressure: 1 bus would cause {round(utilization*2)}% crowding. 2nd bus ensures {r['daily_frequency']} with {utilization}% optimal load."
                recommendation = "Deploy 2 buses · Optimal frequency"
            elif buses_count == 1:
                reason = f"Standard corridor volume ({r['predicted_passengers']} pass/day): 1 bus is adequate for {r['daily_frequency']} ({utilization}% load)."
                recommendation = "Deploy 1 bus · Standard schedule"
            else:
                reason = "Fleet deficit: Route unserved due to total fleet limit."
                recommendation = "No bus allocated · Add fleet"

            output_routes.append({
                "route":                  r["route"],
                "depot":                  r["depot"],
                "single_trip_predicted":  r["single_trip_predicted"],
                "predicted_passengers":   r["predicted_passengers"],
                "daily_frequency":        r["daily_frequency"],
                "corridor_type":          r["corridor_type"],
                "capacity":               r["capacity"],
                "allocated_buses":        buses_count,
                "allocated_capacity":     alloc_cap,
                "utilization":            utilization,
                "demand_level":           level,
                "allocation_reason":      reason,
                "recommendation":         recommendation,
            })

        # Sort by total predicted demand descending to set Priority Rank
        output_routes.sort(key=lambda x: x["predicted_passengers"], reverse=True)
        for rank, row in enumerate(output_routes, start=1):
            row["priority_rank"] = rank

        avg_demand      = round(total_predicted / max(n, 1), 1)
        avg_utilization = round(sum(r["utilization"] for r in output_routes) / max(n, 1), 1)

        return jsonify({
            "success":          True,
            "total_routes":     n,
            "total_buses":      total_buses,
            "bus_type":         selected_bus_type,
            "avg_demand":       avg_demand,
            "avg_utilization":  avg_utilization,
            "date":             date_str,
            "routes":           output_routes,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------------------------
# API: Dashboard Summary
# ---------------------------------------------------------------------------
@app.route("/api/dashboard", methods=["GET"])
def api_dashboard():
    date_str = request.args.get("date", datetime.today().strftime("%Y-%m-%d"))
    total_buses = int(request.args.get("total_buses", 30))
    bus_type = request.args.get("bus_type", "Express")

    with app.test_request_context(
        "/api/optimize",
        method="POST",
        json={"total_buses": total_buses, "date": date_str, "bus_type": bus_type},
        content_type="application/json",
    ):
        result = api_optimize()
        return json.loads(result.get_data(as_text=True))


# ---------------------------------------------------------------------------
# API: Reference Metadata
# ---------------------------------------------------------------------------
@app.route("/api/routes")
def api_routes():
    return jsonify(ROUTES_CONFIG)


@app.route("/api/bus_types")
def api_bus_types():
    return jsonify({"bus_types": BUS_TYPES, "capacities": BUS_CAPACITIES})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 60)
    print(" APSRTC AI Demand Forecasting & Dynamic Bus Allocation")
    print(f" Serving at: http://localhost:{port}")
    print("=" * 60)
    app.run(debug=False, host="0.0.0.0", port=port)
