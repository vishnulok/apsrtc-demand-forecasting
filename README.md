# APSRTC AI – Public Transport Demand Forecasting & Dynamic Bus Allocation

## Project Objective

This project delivers an end-to-end AI-powered web application for **Andhra Pradesh State Road Transport Corporation (APSRTC)**. It addresses two core challenges of urban mobility:

1. **Demand Forecasting** – Predict the number of passengers expected on a given route, date, and bus configuration using a trained machine learning model.
2. **Dynamic Fleet Allocation** – Intelligently distribute a fixed fleet of buses across all routes, prioritising routes with the highest demand pressure.

---

## Dataset

The model was trained on historical APSRTC operational data including:

| Feature | Description |
|---|---|
| `route` | Route identifier (e.g., HYD-VJA) |
| `bus_type` | Category of bus (Regular, Express, Deluxe, Super Luxury, Volvo AC) |
| `depot` | Originating depot city |
| `capacity` | Total seat capacity of the bus |
| `distance_km` | Route length in kilometres |
| `fare_per_passenger` | Ticket price in ₹ |
| `month` | Month of travel (1–12) |
| `day_of_week` | Day index (0 = Monday, 6 = Sunday) |
| `day_of_year` | Day within the year (1–365) |
| `week_number` | ISO week number |
| `previous_passengers` | Passenger count on the previous day |
| `previous_3_avg` | 3-day rolling average of passengers |
| `previous_5_avg` | 5-day rolling average |
| `previous_7_avg` | 7-day rolling average |
| `route_avg_demand` | Historical average demand for the route |

**Target variable:** `passengers` (integer count per trip)

---

## ML Model

| Property | Value |
|---|---|
| Algorithm | Extra Trees Regressor |
| Preprocessing | Included in the saved pipeline |
| Saved as | `apsrtc_demand_model.pkl` |
| Load method | `joblib.load("apsrtc_demand_model.pkl")` |

The model is a **scikit-learn pipeline** that includes all preprocessing steps (encoding, scaling) before the Extra Trees estimator. It accepts a `pandas.DataFrame` with the 15 features listed above and returns predicted passenger counts directly.

---

## Model Performance

| Metric | Value | Interpretation |
|---|---|---|
| **MAE** | 8.04 | On average, predictions are within ±8 passengers of the actual count |
| **RMSE** | 9.96 | Root mean squared error; penalises larger errors more strongly |
| **R² Score** | 0.25 | The model explains variance in demand above a simple mean-baseline predictor |

> **Note:** An R² of 0.25 does **not** mean 25% accuracy. It indicates how much of the variance in passenger counts the model accounts for beyond a naïve mean prediction. Given the high stochasticity of real-world public transport demand, this level of predictive power provides operationally useful signals for resource planning.

---

## Fleet Optimization Method

The allocation uses a **greedy demand-pressure** algorithm:

```
1. Predict demand for every route using the ML model
2. Assign 1 bus per route as a minimum service guarantee
3. Remaining buses = total_buses − number_of_routes
4. While remaining buses > 0:
       demand_pressure[i] = predicted_passengers[i] / (allocated[i] × capacity)
       allocate next bus to route with highest demand_pressure
5. Output final allocation with utilization and recommendation
```

This approach ensures:
- **Fairness** – every route receives at least one bus
- **Efficiency** – additional buses go where they are needed most
- **Convergence** – always terminates (finite buses, finite routes)

---

## Website Features

| Page | URL | Description |
|---|---|---|
| Home | `/` | Landing page with project overview and model summary |
| Demand Prediction | `/prediction` | Single-route ML demand forecast with occupancy chart |
| Fleet Optimization | `/optimization` | Multi-route allocation with charts and ranked table |
| Dashboard | `/dashboard` | Live summary with 4 stat cards and 3 interactive charts |

---

## How to Run the Website

### Prerequisites

```bash
pip install flask joblib numpy pandas scikit-learn
```

### Directory Structure

```
New folder/
├── app.py
├── apsrtc_demand_model.pkl      ← your trained model (required)
├── requirements.txt
├── README.md
├── templates/
│   ├── index.html
│   ├── prediction.html
│   ├── optimization.html
│   └── dashboard.html
└── static/
    ├── style.css
    └── script.js
```

### Start the Server

```bash
cd "c:\Users\Vishnu lok\Downloads\New folder"
python app.py
```

Then open your browser and navigate to:

```
http://localhost:5000
```

### Environment Requirements

- Python 3.8 or later
- `apsrtc_demand_model.pkl` must be in the **same directory** as `app.py`
- Internet connection required to load Chart.js and Google Fonts from CDN

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Home page |
| `GET` | `/prediction` | Prediction form |
| `GET` | `/optimization` | Optimization form |
| `GET` | `/dashboard` | Dashboard page |
| `POST` | `/api/predict` | JSON prediction (single route) |
| `POST` | `/api/optimize` | JSON fleet optimization (all routes) |
| `GET` | `/api/dashboard` | Dashboard data |
| `GET` | `/api/routes` | Route reference data |
| `GET` | `/api/bus_types` | Bus type and capacity data |

### POST `/api/predict` Example

```json
{
  "route": "HYD-VJA",
  "bus_type": "Express",
  "depot": "Hyderabad",
  "capacity": 52,
  "distance_km": 275,
  "fare_per_passenger": 220,
  "date": "2026-08-22"
}
```

### POST `/api/optimize` Example

```json
{
  "total_buses": 25,
  "date": "2026-08-22"
}
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask |
| ML Inference | scikit-learn, joblib, pandas, numpy |
| Frontend | HTML5, Vanilla CSS, JavaScript (ES6+) |
| Charts | Chart.js 4.4 |
| Typography | Google Fonts – Inter, Outfit |
| Design | Dark glassmorphism, CSS animations |

---

*Built for APSRTC Urban Mobility Intelligence · AI-Based Demand Forecasting Project*
