# Smart Traffic Management System (STMS)

Demo implementation of the PDF specification for a smart, IoT-enabled traffic management solution. The project is intentionally human-authored, showing a clean separation between backend (simulated data + APIs) and frontend (dashboard UI).

## Overview
- **Goal:** Showcase how adaptive traffic signals can react to live traffic flows using sensor feeds.
- **Scope:** Focuses on the software workflow (data processing, decision engine, dashboard). Hardware integration is mocked with synthetic data.
- **Tech Stack:** Node.js + Express for the backend API, vanilla HTML/CSS/JS for the frontend dashboard.

## Project Structure
```
project/
├─ backend/
│  ├─ package.json
│  └─ src/
│     ├─ index.js        # Express server & REST endpoints
│     └─ simulator.js    # Core simulation & metrics logic
└─ frontend/
   ├─ index.html          # Dashboard layout
   ├─ app.js              # Fetches API data & renders UI
   └─ styles.css          # Styling with responsive design
```

## Backend
1. Ensure Node.js (18+) is installed.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the API server:
   ```bash
   npm start
   ```
   The server listens on **http://localhost:4000** by default.

### API Endpoints
| Method | Endpoint          | Description                                |
|--------|-------------------|--------------------------------------------|
| GET    | `/health`         | Basic status check                         |
| GET    | `/api/state`      | Current intersections + citywide metrics   |
| GET    | `/api/history`    | Rolling history (default last 20 snapshots) |
| POST   | `/api/step`       | Manually advance the simulation            |
| POST   | `/api/override`   | Force a specific approach green for a time |

## Frontend
1. Serve the `frontend/` folder using any static file server (e.g. `npx serve frontend`).
2. Open the served URL in a browser. If the API runs on another host/port, set `window.API_BASE_URL` before loading `app.js`.

### Dashboard Features
- **Citywide Metrics:** Average queue length, wait time, active emergencies, congestion index by junction.
- **Intersection Cards:** Visual status for each approach, highlighting the active (green) lane.
- **Manual Override:** Trigger temporary priority for a lane (e.g. emergency response).
- **History Table:** Recent snapshots to show system reaction over time.

## Simulation Assumptions
- Junctions and queue values are seeded from realistic Bangalore intersections.
- Sensor noise and emergency vehicle probability are randomized each cycle.
- Override commands lock a lane green for a configurable duration.

## Planned Enhancements
1. Persist history and configurations in a database (e.g. SQLite/MySQL).
2. Add authentication and role-based access for control overrides.
3. Integrate real sensor feeds via MQTT/REST once hardware is available.
4. Extend to multi-junction coordination and adaptive timing predictions.

## License
MIT
