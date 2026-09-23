# CAT Smart Operator — CATman_central

The operator-side application: a `backend/` (Express + Socket.IO + MQTT +
Firestore + Gemini) and a `frontend/` (React + Vite + Tailwind) dashboard.
It talks to `../caterpillar-machine-simulator` (the machine side) over MQTT
only.

What works end to end:

- **Shift flow**: pre-check → safety checklist → tasks → end shift → summary.
- **Machine pre-check** in AUTO mode, or MANUAL mode where a person on the
  machine side checks each sensor.
- **Live safety alerts**: a full-width banner with an alarm, vibration and a
  spoken warning in the operator's language, an alert centre, and a
  black-box replay.
- **SOS** (hold for 2 s) and a **Control Room** page for supervisors.
- **Languages**: English, Hindi and Tamil across the UI, alerts and voice.
- **Gemini assistant** that answers from live dashboard data and opens the
  right screen.
- **E-Learning**: a 3D cab simulator; XP and progress are saved.
- **Task history** and **profile** (level, badges).
- **Firestore** persistence, with an in-memory fallback.

---

## Quick start

You need an MQTT broker on `mqtt://localhost:1883` (Mosquitto as a service,
or `npm run broker` inside `backend/`).

```bash
# Terminal 1 — backend (http://localhost:8000)
cd backend
npm install
cp .env.example .env         # then fill in Firebase + Gemini keys (optional)
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install
npm run dev

# Terminal 3 — machine simulator (control page http://localhost:3000)
cd ../caterpillar-machine-simulator
npm install
npm start
```

Open the simulator control page, pick a machine (EXC001), and press
**Start**. Then open the dashboard.

**Choosing the operator (no login yet).** The dashboard uses OP1001 by
default. Open `http://localhost:5173/?operator=OP1003` once to switch; the
browser remembers the choice.

| Operator | Machine | Language |
|---|---|---|
| OP1001 | EXC001 | English |
| OP1002 | EXC002 | Tamil |
| OP1003 | EXC003 | Hindi |
| OP1004 | EXC002 | — |
| OP1005 | EXC003 | — |

The simulator control page drives the machine that the operator is assigned
to, so start the matching machine (for example, EXC003 for OP1003).

---

## 1. Architecture

```
caterpillar-machine-simulator                 CATman_central/backend
┌──────────────────────────┐   machines/{id}/telemetry|heartbeat|state|events
│ machine + control page   │ ─────────────────────────────────▶ mqtt.service
│ (scenarios, pre-check    │   machines/{id}/precheck/ack|progress|result      │
│  responder, horn, site)  │ ◀─────────────────────────────────  │ event bus
└──────────────────────────┘   machines/{id}/commands/precheck|shift|horn     ▼
                                site/conditions                  services ──▶ Firestore
                                                                    │ Socket.IO
                                                                    ▼
                                                         frontend (dashboard)
```

- **MQTT → event bus → services.** `mqtt.service` only parses topics and
  emits on an in-process bus. The shift, pre-check, safety, alert, task and
  idle-lesson services subscribe to that bus.
- **Repository (`db/repo.js`).** Reads come from memory. Writes go to
  memory and are persisted to Firestore in the background. On boot the
  collections are preloaded from Firestore, with a 12 s timeout. If Firebase
  isn't configured or can't be reached, everything still works in memory.
- **Safety engine (`safety.engine.js`).** Deterministic rules over telemetry
  plus site conditions. The stop zone scales with conditions:
  3 m × rain 1.5 × low visibility 1.5 × night 1.3 × loaded 1.2 × fast 1.3.
  The warning zone is twice the stop zone. The engine never reads the
  simulator's `scenario` field; `npm run evaluate` checks detection against
  it.
- **Alerts** go ALERTED → ESCALATED (after 15 s with no ACK; the Control
  Room is notified) → ACKNOWLEDGED → RESOLVED. CRITICAL alerts need a person
  to acknowledge them; lower ones resolve on their own when the condition
  clears. Each critical alert opens an incident with a black-box of
  telemetry from 60 s before and 60 s after.
- **Languages.** Alerts are sent as a code plus parameters
  (`alert.title.PROXIMITY_CRITICAL`, `{distance, zone}`). Each screen
  translates them, so every operator reads and hears them in their own
  language.

The ML model (`backend/src/ml/anomaly_ensemble.py`) is kept as-is and not
wired into the live pipeline.

---

## 2. Shift flow (what the operator sees)

| State | Screen |
|---|---|
| NOT_STARTED | Machine card, today's tasks, **Run machine pre-check** |
| PRECHECK_RUNNING | Sensors tick in live, with AUTO or MANUAL mode shown |
| PRECHECK_FAILED | What failed, maintenance ticket number, spare machines, retry |
| PRECHECK_PASSED | Warnings to acknowledge (if any), then the safety checklist |
| CHECKLIST_COMPLETE | Next task and **Start task** |
| TASK_ACTIVE / TASK_PAUSED | Progress ring, minutes left, delay risk ("Why?"), safety zone |
| SHIFT_ENDED | Summary: fuel, idle time, alerts, safety score, XP, CO₂, cost |

The safety checklist can't be ticked blindly:

- **Seatbelt** is refused unless the machine's seatbelt sensor reads
  fastened.
- **Horn** is ticked only when the machine reports that the horn actually
  sounded (**Test horn** sends an MQTT command and waits up to 10 s).

### MANUAL pre-check (human in the loop)

1. On the simulator control page, switch the pre-check panel to **MANUAL**.
2. The operator presses **Run machine pre-check** on the dashboard.
3. On the simulator page, a person marks each of the 15 sensors OK, WARN or
   FAIL (with an optional note). Each one appears on the operator's
   dashboard as soon as it's marked. "Mark all OK" does all of them at once.
4. **Submit** is enabled only once all 15 are marked. The dashboard then
   shows the result, and the operator continues.

In MANUAL mode, if a person overrides a sensor reading (for example, marks
it FAIL when the reading was OK), that's recorded in the audit log. A
critical sensor that is FAIL fails the pre-check and opens a maintenance
ticket.

---

## 3. Repository structure

```
backend/src/
├── server.js                  boot: repo → seed → services → MQTT → listen
├── config/env.js
├── db/                        firestore.js, repo.js (write-through), seed.js
├── data/                      operators.json, tasks.json, trainingModules.json
├── routes/                    one router per area (see §5)
├── services/
│   ├── bus.js                 in-process event bus
│   ├── mqtt.service.js        topics → bus; publishCommand()
│   ├── precheck.service.js    request/ack/progress/result, evaluation
│   ├── shift.service.js       state machine, checklist, horn test, summary
│   ├── task.service.js        today's tasks, live progress + ETA
│   ├── safety.engine.js       rules + dynamic safety envelope
│   ├── alert.service.js       dedupe, lifecycle, escalation
│   ├── incident.service.js    incidents, SOS, maintenance tickets, black-box
│   ├── training.service.js    modules, progress, XP, recommendations, badges
│   ├── idleLesson.service.js  suggests a lesson after long idling
│   ├── assistant.service.js   Gemini function calling + offline fallback
│   ├── operator / machine / site / audit / connectivity / telemetryStore
├── socket/socket.js
├── ml/anomaly_ensemble.py     not wired in
└── scripts/                   seed.js, evaluateDetection.js, mqttBroker.js

frontend/src/
├── context/LiveContext.jsx    all live state + actions (socket + REST)
├── i18n/                      en.js, hi.js, ta.js, translate()
├── api/client.js              axios; ?operator= switch
├── layout/                    AppShell, TopBar (language, SOS, bell, XP), Sidebar
├── pages/                     Dashboard, ELearning, TaskHistory, Profile, ControlRoom, SimulationPlayer
├── components/
│   ├── dashboard/             PrecheckPanel, SafetyChecklist, ActiveTaskPanel, EnvelopeIndicator, ShiftSummary, ...
│   ├── alerts/                AlertBanner, AlertCenter, AlertItem, IncidentReplay
│   └── sos/                   SosButton, SosStatus
├── assistant/                 AssistantPanel, useAssistantNavigation
├── sim/                       3D cab simulator (three.js)
└── utils/                     alarm (sound, vibrate, speech), format
```

---

## 4. Environment variables

`backend/.env` (copy from `.env.example`; **never commit keys**):

| Variable | Default | Purpose |
|---|---|---|
| `PORT`, `HOST`, `CLIENT_URL` | 8000, 0.0.0.0, :5173 | Server; any `localhost` port is also allowed by CORS |
| `MQTT_URL` | mqtt://localhost:1883 | Same broker as the simulator |
| `HEARTBEAT_STALE_SEC` / `HEARTBEAT_OFFLINE_SEC` | 10 / 20 | Connectivity status |
| `PRECHECK_TIMEOUT_MS` | 5000 | Wait for the machine to acknowledge a pre-check |
| `PRECHECK_AUTO_RESULT_TIMEOUT_MS` | 15000 | AUTO result deadline |
| `PRECHECK_MANUAL_TIMEOUT_MS` | 600000 | MANUAL result deadline |
| `HORN_TEST_WINDOW_MS` | 10000 | Horn test window |
| `ALERT_ESCALATION_MS` | 15000 | Unacknowledged critical → Control Room |
| `BLACK_BOX_WINDOW_MS` | 60000 | Before/after window for incidents |
| `IDLE_LESSON_AFTER_SEC` | 180 | Suggest a lesson after this much idling |
| `FUEL_PRICE_INR` | 95 | Shift cost in the summary |
| `FIREBASE_API_KEY` … `FIREBASE_APP_ID` | empty | Firebase web config; empty = in-memory only |
| `GEMINI_API_KEY` | empty | Empty = offline keyword assistant |
| `GEMINI_MODELS` | 3.6-flash, 3.5-flash, 3.1-flash-lite | Tried in order |

`frontend/.env`: `VITE_API_URL=http://localhost:8000/api`,
`VITE_SOCKET_URL=http://localhost:8000`.

**Firestore.** The app uses the Firebase *client* SDK with the web config,
so the database must allow reads and writes (test mode or equivalent
rules). Collections: `machines`, `operators`, `tasks`, `shifts`, `alerts`,
`incidents`, `trainingProgress`, `auditLog`. `npm run seed` writes machines
and operators; `npm run seed -- --force` overwrites them. `GET /api/health`
shows whether storage is `firestore` or `memory`.

---

## 5. REST API

Every endpoint that acts for an operator takes `operatorId` (query or body).
The default is OP1001.

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` (MQTT, storage, assistant mode) |
| Machines | `GET /api/machines`, `GET /api/machines/:id`, `GET /api/fleet` |
| Operator | `GET /api/operators`, `GET/PATCH /api/operators/me` (language), `GET /api/operators/me/profile` |
| Shift | `GET /api/shift/current`; `POST /api/shift/precheck`, `/precheck/cancel`, `/precheck/ack-warnings`, `/switch-machine` |
| Checklist | `POST /api/shift/checklist/item`, `/checklist/horn`, `/checklist/complete` |
| Task in shift | `POST /api/shift/task/start`, `/task/pause`, `/task/resume`, `/task/complete`; `POST /api/shift/end`, `/api/shift/new` |
| Tasks | `GET /api/tasks/today`, `GET /api/tasks/history` |
| Alerts | `GET /api/alerts`, `POST /api/alerts/:id/ack`, `/:id/resolve` |
| Incidents | `GET /api/incidents`, `GET /api/incidents/:id` (with black-box), `POST /api/incidents/sos`, `/:id/ack`, `/:id/resolve`, `/:id/cancel` |
| Training | `GET /api/training/modules`, `/modules/:id`, `POST /modules/:id/complete`, `GET /progress`, `GET /recommended` |
| Assistant | `POST /api/assistant/chat` `{message, history, language}` → `{reply, actions}` |
| Site | `GET /api/site/conditions` (includes the current safety envelope) |
| Audit | `GET /api/audit` |

## 6. Socket.IO events

Every client receives every event (there are no rooms yet). Each screen
filters by its own machine and operator.

`machine:telemetry`, `machine:connectivity`, `heartbeat`, `site:conditions`,
`shift:updated`, `precheck:progress`, `precheck:result`, `task:updated`,
`alert:new`, `alert:updated`, `safety:envelope`, `supervisor:escalation`,
`incident:new`, `incident:updated`, `sos:new`, `operator:updated`,
`xp:awarded`, `training:idle_prompt`, `training:idle_prompt_cancel`.

## 7. Assistant

Open it with **Assistant** in the top bar. It answers in the selected
language, using live data through these tools: machine status, active
alerts, today's tasks, shift state, pre-check result, idle stats,
incidents, training modules, recommendations, shift summary, profile and
site conditions.

When the answer points to a screen, it adds **Open** buttons and jumps to
that screen, e.g. "take me to seatbelt training" or "show my alerts".
Without a Gemini key, or if every model fails, a keyword fallback still
answers the common questions and navigates.

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

Completing a module saves the score to `trainingProgress` and awards XP only when you beat your previous best. The E-Learning page shows recommended modules (based on your recent alerts) and your progress. Current limits:
The cab and machine are built from simple shapes,
not a CAD model.

---

## 9. Demo script

1. **Start the simulator** machine EXC001 and open the dashboard.
2. **Pre-check:** press **Run machine pre-check** and watch the sensors
   tick in.
3. **MANUAL pre-check:** switch the simulator panel to MANUAL and run it
   again. Mark BRAKES as FAIL and press Submit. The dashboard shows the
   maintenance ticket and a spare machine.
4. **Checklist:** start the simulator scenario `SEATBELT_VIOLATION` and try
   to tick the seatbelt. It's refused. Stop the scenario, then tick
   everything and press **Test horn**.
5. **Start task**, then start the scenario `WORKER_NEARBY`. The red banner,
   alarm and spoken warning appear. Switch the language to हिंदी and the
   banner changes language. If nobody acknowledges within 15 s, the alert
   escalates to the Control Room.
6. **SOS:** hold SOS for 2 s. In **Control Room**, press **Acknowledge**
   and the operator sees "Supervisor is on the way". Open **Replay** for
   the black-box.
7. **Assistant:** ask "What should I do now?" or "Take me to seatbelt
   training".
8. **End shift** to see the summary, XP, and the updated profile and
   history.

Detection check against the simulator's labelled scenarios:
`npm run evaluate` (in `backend/`) prints precision and recall per rule.

## 10. Not built yet

- Login and roles; the operator is picked with `?operator=`.
- Socket rooms per machine.
- Wiring the ML anomaly model into the live pipeline.
- Video/quiz and instructor-led training modules.
