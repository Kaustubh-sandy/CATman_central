# CAT Smart Operator — CATman_central

The operator-side application: a `backend/` (Express + Socket.IO + MQTT) and a
`frontend/` (React + Vite + Tailwind) dashboard. This is a sibling app to
`../caterpillar-machine-simulator`, which is the machine side.

Only the Dashboard (NOT_STARTED view) is implemented so far — see
`../IMPLEMENTATION_PLAN.md` for the full roadmap and UI guide.

---

## Quick Start (backend + frontend)

You need an MQTT broker running at `mqtt://localhost:1883` for live machine
data (e.g. [Mosquitto](https://mosquitto.org/download/) installed as a
service, or `npm run broker` inside `backend/` for a throwaway dev broker).
Without one, the backend still runs fine — the dashboard just shows every
machine as OFFLINE until telemetry arrives.

**Terminal 1 — backend** (`http://localhost:8000`):
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 — frontend** (`http://localhost:5173`):
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in a browser. To see live machine data instead
of OFFLINE placeholders, also start the machine simulator — see section 4
below ("Running it") for the full multi-process setup including MQTT and the
simulator.

---

## 1. Architecture

```
caterpillar-machine-simulator            CATman_central
┌───────────────────────┐                ┌──────────────────────────────────┐
│  Machine (EXC001...)   │  MQTT          │  backend/                        │
│  publishes telemetry   │─ ─ ─ ─ ─ ─ ─ ▶ │   mqtt.service       (subscribe) │
│  to machines/{id}/     │  QoS 0         │   telemetryStore     (latest +   │
│  telemetry             │                │                       history)  │
└───────────────────────┘                │   connectivity.service (ONLINE/  │
                                          │                     STALE/OFFLINE)│
                                          │   REST API  +  Socket.IO ────────┤
                                          └──────────────────┬───────────────┘
                                                              │ machine:telemetry
                                                              │ machine:connectivity
                                                              ▼
                                          ┌──────────────────────────────────┐
                                          │  frontend/ (React dashboard)     │
                                          └──────────────────────────────────┘
```

Communication between the two apps is **MQTT only**. `backend/` never imports
simulator code. Data is in-memory only (no DB yet): restarting the backend
clears telemetry history and connectivity state, but machine/task/operator
seed data is static JSON.

The ML anomaly detection model (`backend/src/ml/anomaly_ensemble.py`) is kept
as-is and not wired into the live pipeline yet — that's a later phase.

---

## 2. Requirements

- Node.js v18+ (v20 recommended)
- An MQTT broker reachable at `MQTT_URL` (both apps default to
  `mqtt://localhost:1883`). If you don't have one running locally
  (e.g. [Mosquitto](https://mosquitto.org/download/)), you can use the
  bundled dev broker: `npm run broker` inside `backend/`.

---

## 3. Repository Structure

```
CATman_central/
├── backend/
│   ├── src/
│   │   ├── server.js                Express + Socket.IO entrypoint
│   │   ├── config/env.js
│   │   ├── data/                    operators.json, tasks.json (seed data)
│   │   ├── ml/anomaly_ensemble.py   ML model (not wired in yet)
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── mqtt.service.js          subscribes machines/+/telemetry
│   │   │   ├── telemetryStore.service.js latest + rolling history per machine
│   │   │   ├── connectivity.service.js   ONLINE / STALE / OFFLINE
│   │   │   ├── machine.service.js        machine registry (Firestore or in-memory)
│   │   │   ├── operator.service.js       stub "current operator" (no auth yet)
│   │   │   ├── task.service.js
│   │   │   ├── firebase.service.js       optional; falls back to in-memory
│   │   │   └── anomalyDetection.service.js  placeholder for the ML integration
│   │   ├── socket/socket.js
│   │   └── scripts/
│   │       ├── seed.js
│   │       └── mqttBroker.js         optional local dev MQTT broker
│   ├── .env / .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/            axios client + socket.io client
    │   ├── hooks/          useFleet, useTasks, useOperator, useSiteConditions
    │   ├── layout/         AppShell, Sidebar, TopBar
    │   ├── pages/          Dashboard, ComingSoon (E-Learning/History/Profile stubs)
    │   ├── components/     MachineStatusCard, TaskCard, SiteConditionsCard, ...
    │   └── utils/
    └── package.json
```

---

## 4. Running it

**1. MQTT broker** — skip this if you already have one (e.g. Mosquitto
running as a service on `localhost:1883`):
```bash
cd backend
npm run broker
```

**2. Backend**
```bash
cd backend
npm install
npm run dev        # or: npm start
```
Boots on `http://localhost:8000`, connects to `MQTT_URL`, and seeds
`EXC001`/`EXC002`/`EXC003` into the machine registry if missing.

**3. Frontend**
```bash
cd frontend
npm install
npm run dev
```
Opens on `http://localhost:5173`.

**4. Machine simulator** (separate app, publishes real MQTT telemetry)
```bash
cd ../../caterpillar-machine-simulator
npm start
curl -X POST http://localhost:3000/api/machine/start \
  -H "Content-Type: application/json" \
  -d '{"machineId":"EXC001"}'
```
The control server only runs one machine per process. To simulate more than
one machine at once, run additional instances on different ports (see that
app's README/config for `PORT`/`MQTT_BROKER_URL`).

Once telemetry is flowing, the Dashboard's machine status card goes live and
`GET /api/fleet` reflects real fuel/temperature/connectivity data.

---

## 5. Environment Variables

`backend/.env.example`:
```env
PORT=8000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173

MQTT_URL=mqtt://localhost:1883
HEARTBEAT_STALE_SEC=10
HEARTBEAT_OFFLINE_SEC=20

# Optional — falls back to an in-memory machine registry if unset
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

`frontend/.env.example`:
```env
VITE_API_URL=http://localhost:8000/api
VITE_SOCKET_URL=http://localhost:8000
```

---

## 6. REST API (implemented so far)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | |
| GET | `/api/machines` | registry only, no live data |
| GET | `/api/machines/:id` | registry + latest telemetry + connectivity |
| GET | `/api/fleet` | all machines, same shape as above |
| GET | `/api/tasks/today?operatorId=` | static seed data |
| GET | `/api/operators/me` | stub — always returns the first seeded operator (no auth yet) |
| GET | `/api/site/conditions` | static stub |

## 7. Socket.IO events

| Event | Payload |
|---|---|
| `machine:telemetry` | raw telemetry payload from the simulator |
| `machine:connectivity` | `{ machineId, status, lastSeenAt }` on status change |

No rooms/auth yet — every connected client receives every machine's events.

---

## 8. What's not built yet

Everything else in `../IMPLEMENTATION_PLAN.md`: pre-check flow, shift state
machine, safety engine, behaviour/anomaly engine wiring, ETA service,
training hub, AI assistant, and the E-Learning/Task History/Profile pages
(currently placeholder screens in the sidebar).
