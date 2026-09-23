# CAT Smart Operator — CATman_central

The operator-side application: a `backend/` (Express + Socket.IO + MQTT) and a
`frontend/` (React + Vite + Tailwind) dashboard. This is a sibling app to
`../caterpillar-machine-simulator`, which is the machine side.

Implemented so far: the Dashboard (NOT_STARTED view) and the E-Learning page
with a 3D excavator-cab training simulator (section 8). See
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
│   │   ├── data/                    operators.json, tasks.json, trainingModules.json
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
│   │   │   ├── training.service.js       serves simulator modules from JSON
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
    │   ├── pages/          Dashboard, ELearning, SimulationPlayer, ComingSoon (History/Profile)
    │   ├── components/     MachineStatusCard, TaskCard, SiteConditionsCard, ...
    │   ├── sim/            3D cab simulator (three.js via @react-three/fiber)
    │   │   ├── SimSession.jsx      wires scene + scenario engine + HUD
    │   │   ├── scenarioEngine.js   step/decision graph, scoring, violations, timeouts
    │   │   ├── machineModel.js     machine state, joystick kinematics, temps, fuel
    │   │   ├── monitorDisplay.js   draws the in-cab monitor onto a canvas texture
    │   │   ├── scene/              Cab, Boom, World, Worker, Rain, Monitor, CameraGuide, ...
    │   │   └── ui/                 SimHud, SimIntro, SimResults, TouchPad
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
| GET | `/api/training/modules` | module summaries (no scenario graph) |
| GET | `/api/training/modules/:id` | full module incl. scenario nodes |

## 7. Socket.IO events

| Event | Payload |
|---|---|
| `machine:telemetry` | raw telemetry payload from the simulator |
| `machine:connectivity` | `{ machineId, status, lastSeenAt }` on status change |

No rooms/auth yet — every connected client receives every machine's events.

---

## 8. E-Learning: 3D cab simulator

Sidebar → **E-Learning** → pick a module → **Start**. You sit in the
operator's seat of an excavator cab (seat, joysticks, lockout lever, key,
throttle dial, seatbelt, live monitor) and look out at the boom, arm and
bucket, a dump truck, and site workers.

| Module | What it trains |
|---|---|
| Safe start-up | belt → monitor check → engine → horn → look around → unlock hydraulics → move |
| Worker in swing radius — rain | low visibility; a worker walks into the swing area — stop, horn, lock out, wait, warn |
| Engine overheating | temperature climbs on the monitor — lower bucket, idle down, lock out, report |
| End-of-shift shutdown | bucket down, idle, lock out, engine off, belt off |

**Controls**

| | Mouse / touch | Keyboard |
|---|---|---|
| Look around | drag | — |
| Use a control | tap it in the cab | B belt · E key · Q lockout · T throttle · H horn · M monitor |
| Left joystick (arm / swing) | left on-screen pad | W A S D |
| Right joystick (boom / bucket) | right on-screen pad | ↑ ↓ ← → or I J K L |

Joysticks follow the ISO pattern: left stick forward/back = arm out/in,
left/right = swing; right stick forward/back = boom down/up, left/right =
bucket curl/dump.

**What the sim enforces.** The engine won't start with the hydraulics
unlocked, and the joysticks do nothing while the hydraulics are locked.
Steps done out of order lose points. Unsafe acts (operating without the
seatbelt, removing the belt with the hydraulics live) are logged as safety
issues. Hazard decisions have a countdown, and moving the machine during one
counts as a choice. **Show me** turns the camera to the control and highlights
it. The results screen shows pass/fail (70% of the best score and no FAIL
ending), XP, safety issues, and a step-by-step log.

**Adding a module.** Add an entry to `backend/src/data/trainingModules.json`
(no frontend change needed). Each node is one of:
- `ACTION`: `expect` action(s), `hintTarget`, `score`, `next`
- `DECISION`: `choices` (optionally triggered by in-cab `actions`, or
  `hidden`), plus optional `timeoutSec`/`timeoutNext`/`graceSec`
- `END`: `outcome` PASS/FAIL and `feedback`

Optional `sceneEvent` values: `WORKER_APPROACH | WORKER_STOP_WAVE |
WORKER_LEAVE | WORKER_IDLE_FAR | TEMP_RISE | TEMP_COOL`. Action names and hint
targets are listed in `frontend/src/sim/scenarioEngine.js` and
`frontend/src/sim/scene/CameraGuide.jsx`.

Current limits: XP and completions are shown but **not saved** yet (no
training progress backend). The cab and machine are built from simple shapes,
not a CAD model.

---

## 9. What's not built yet

Everything else in `../IMPLEMENTATION_PLAN.md`: pre-check flow, shift state
machine, safety engine, behaviour/anomaly engine wiring, ETA service,
training progress/XP persistence, video/quiz and instructor modules,
recommendations, AI assistant, and the Task History/Profile pages
(currently placeholder screens in the sidebar).
