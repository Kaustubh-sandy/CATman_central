# CATman_central Backend — Hard-coded Data Inventory

Written for: the team deciding what to move into configuration or a database before this leaves the demo stage.

Scope: everything under [backend/](backend/) that is a fixed value in code or in a data file rather than something
read from the live machine, Firestore or `.env`. How the features work is in
[BACKEND_FEATURES.md](BACKEND_FEATURES.md).

**Legend — "Move to":** `config` = an env var or settings doc, `db` = Firestore, `keep` = fine as a constant.
**Risk** is how much a wrong or stale value would matter: 🔴 safety or money, 🟠 wrong behaviour, 🟡 cosmetic or demo only.

**Headline findings**

1. Seed data is real-looking but fake: 3 machines, 5 operators and their tasks are JSON/inline literals; **one operator
   (OP1003) has a single task per day**, so a demo run uses it up.
2. Every **safety threshold** (temperature 105 °C, vibration 0.8 g, tilt 15°, 3 m base zone, …) is an inline literal in
   [safety.engine.js](backend/src/services/safety.engine.js), applied identically to every machine, load and operator.
3. The **"predicted" ETAs and the safety score are formulas over constants**, not learned values.
4. **Live `.env` contains real Firebase and Gemini keys** (the file is gitignored, but this folder is not a git repo yet,
   and the keys were pasted in chat, so treat them as exposed and rotate them).
5. Several values are **duplicated** across files or between backend and simulator and must be kept equal by hand (§9).

---

## 1. Master and seed data

| Data | Where | Value | Risk | Move to |
|---|---|---|---|---|
| Machines | [db/seed.js:4-8](backend/src/db/seed.js#L4-L8) | `EXC001`, `EXC002`, `EXC003`, "Excavator 00N", type "Hydraulic Excavator" | 🟠 | db (managed), seed only once |
| Operators (5) | [data/operators.json](backend/src/data/operators.json) | names, experience years, certifications, `assignedMachineId`, `language`, `xp: 0` | 🟠 | db |
| Operator→machine assignment | same | OP1001→EXC001, OP1002→EXC002, OP1003→EXC003, OP1004→EXC002, OP1005→EXC003 (two operators share EXC002 and EXC003) | 🟠 | db / roster |
| Daily tasks | [data/tasks.json](backend/src/data/tasks.json) | 1–3 templates per operator: title, type, site zone, target load cycles, priority, scheduled window | 🟠 | db, scheduling UI |
| Task counts | same | OP1001: 3 tasks; OP1002, OP1003, OP1004, OP1005: **1 task each** | 🟡 | db |
| Task plan ETA | same | `etaMin`, `etaLowMin`, `etaHighMin` per task (e.g. T1001: 9 / 8 / 11 min for 6 cycles) — hand-typed, used for the plan and for `delayRisk` | 🟠 | derive from history / the ETA model |
| Training modules (4) | [data/trainingModules.json](backend/src/data/trainingModules.json) | full scenario graphs, prompts, scores (+5, +15, −10, −15 …), timeouts, hints, XP (50, 80, 70, 40), difficulty, duration, weather/temperature of each sim | 🟡 | db / CMS (content, not code) |
| Site conditions default | [site.service.js:5-10](backend/src/services/site.service.js#L5-L10) | `CLEAR`, `GOOD`, `31 °C` until a `site/conditions` message arrives | 🟠 | config |
| Machine location | — | comes from the simulator's `MACHINE_LATITUDE/LONGITUDE` (12.97, 79.156), not from the backend | 🟡 | live data |

## 2. Safety rules and thresholds ([safety.engine.js](backend/src/services/safety.engine.js))

These decide when an operator is alerted, so a wrong value is a safety issue. All are literals, global (not per machine, per
operator or per site).

| Rule | Value | Line | Risk | Move to |
|---|---|---|---|---|
| Base critical distance | **3 m** | [:8](backend/src/services/safety.engine.js#L8) | 🔴 | config per site |
| Warning distance | **2 × critical** | [:24](backend/src/services/safety.engine.js#L24) | 🔴 | config |
| Rain factor | ×1.5 | [:15](backend/src/services/safety.engine.js#L15) | 🔴 | config |
| Fog / low-visibility factor | ×1.5 | [:16](backend/src/services/safety.engine.js#L16) | 🔴 | config |
| Night factor and hours | ×1.3, 19:00–06:00 server local time | [:17-18](backend/src/services/safety.engine.js#L17-L18) | 🔴 | config + site time zone |
| Loaded factor | ×1.2 when load > 0 kg | [:19](backend/src/services/safety.engine.js#L19) | 🔴 | config |
| Speed factor | ×1.3 when speed > 5 km/h | [:20](backend/src/services/safety.engine.js#L20) | 🔴 | config |
| Seatbelt sustain | 5 s while OPERATING / LOADING / UNLOADING / TRANSPORTING | [:4-6](backend/src/services/safety.engine.js#L4-L6) | 🔴 | config |
| Unattended sustain | 30 s (operator absent, rpm > 0) | [:6](backend/src/services/safety.engine.js#L6) | 🟠 | config |
| Fatigue | 4 h since `shift.activeSince` | [:7](backend/src/services/safety.engine.js#L7) | 🟠 | config |
| Rollover tilt | 15° (10° when loaded and boom > 2 m) | [:92-93](backend/src/services/safety.engine.js#L92-L93) | 🔴 | per machine model |
| Overheating | engine > 105 °C or hydraulic > 95 °C | [:108](backend/src/services/safety.engine.js#L108) | 🔴 | per machine model, and ambient-adjusted |
| Low oil pressure | < 150 kPa when rpm > 800 | [:115](backend/src/services/safety.engine.js#L115) | 🔴 | per machine model |
| High vibration | > 0.8 g | [:122](backend/src/services/safety.engine.js#L122) | 🟠 | per machine model |
| Impact | > 2.5 g | [:126](backend/src/services/safety.engine.js#L126) | 🔴 | config |
| Overload | load > `ratedCapacityKg` (the rated value comes from the machine, not hard-coded here) | — | 🔴 | live data |
| Severity of each rule | CRITICAL / HIGH / MEDIUM assigned inline per rule | throughout | 🔴 | config (rule table) |
| Working states | `OPERATING, LOADING, UNLOADING, TRANSPORTING` | [:4](backend/src/services/safety.engine.js#L4) | 🟠 | keep, but shared with simulator |

## 3. Scoring, XP and cost constants

| Constant | Value | Where | What it drives | Risk | Move to |
|---|---|---|---|---|---|
| Safety score | `100 − 15·critical − 8·high − 3·medium`, floor 0 | [shift.service.js:431](backend/src/services/shift.service.js#L431) | end-of-shift score, profile trend | 🟠 | config |
| XP per completed task | 10 | [shift.service.js:37](backend/src/services/shift.service.js#L37) | shift XP | 🟡 | config |
| XP for a clean shift | 50 | [shift.service.js:38](backend/src/services/shift.service.js#L38) | shift XP | 🟡 | config |
| XP per level | 200 | [operator.service.js:7](backend/src/services/operator.service.js#L7) | level | 🟡 | config |
| Simulation pass mark | 70 % | [training.service.js:7](backend/src/services/training.service.js#L7) | pass/fail and XP | 🟡 | config |
| Recommendation / badge window | 7 days | [training.service.js:6](backend/src/services/training.service.js#L6), [operator.routes.js:8](backend/src/routes/operator.routes.js#L8) | recommendations, badges, profile | 🟡 | config |
| Badge rules | 5 badges with inline conditions (e.g. seatbelt streak = ≥ 1 shift this week and 0 seatbelt alerts) | [training.service.js:badges()](backend/src/services/training.service.js) | profile | 🟡 | config |
| CO₂ factor | 2.68 kg per litre of diesel | [shift.service.js:39](backend/src/services/shift.service.js#L39) | summary | 🟡 | config |
| Fuel price | ₹95 / L (default; env `FUEL_PRICE_INR`, integer only) | [env.js:25](backend/src/config/env.js#L25) | cost in summary and assistant | 🟠 | config (already) |
| Idle burn rate | **4 L/h** | [assistant.service.js:15](backend/src/services/assistant.service.js#L15) | idle fuel and cost the assistant reports | 🟠 | derive from telemetry baseline |
| Fuel tank capacity | **400 L** | [machine.service.js:6](backend/src/services/machine.service.js#L6) | fuel gauge %, for every machine | 🟠 | per machine in `machines` doc |
| Recommendation fallback | `SIM_SHUTDOWN` / "End-of-shift shutdown" / 2 min | [idleLesson.service.js](backend/src/services/idleLesson.service.js) | idle lesson prompt | 🟡 | derive from modules |

## 4. Rule → training mapping

[training.service.js:10-18](backend/src/services/training.service.js#L10-L18) — fixed dictionary

| Alert rule | Module |
|---|---|
| `SEATBELT_VIOLATION` | `SIM_STARTUP` |
| `LOCKOUT_NOT_ENGAGED`, `UNATTENDED_MACHINE` | `SIM_SHUTDOWN` |
| `PROXIMITY_CRITICAL`, `PROXIMITY_WARNING` | `SIM_PROXIMITY_RAIN` |
| `OVERHEATING`, `LOW_OIL_PRESSURE` | `SIM_OVERHEAT` |

Not mapped (so they never produce a recommendation): `ROLLOVER_RISK`, `OVERLOAD`, `HIGH_VIBRATION`, `IMPACT`, `FATIGUE`.
Risk 🟡. Move to the module JSON (`triggers: [...]`) so adding a module needs no code change.

## 5. Timings, limits and intervals

| Value | Default | Where | Configurable? |
|---|---|---|---|
| Machine ONLINE→STALE | 10 s | [env.js](backend/src/config/env.js) `HEARTBEAT_STALE_SEC` | env |
| STALE→OFFLINE | 20 s | `HEARTBEAT_OFFLINE_SEC` | env |
| Connectivity monitor tick | 3 s | [connectivity.service.js:69](backend/src/services/connectivity.service.js#L69) | **no** |
| Pre-check acknowledge timeout | 5 s | `PRECHECK_TIMEOUT_MS` | env |
| Pre-check result timeout, AUTO / MANUAL | 15 s / 10 min | `PRECHECK_AUTO_RESULT_TIMEOUT_MS`, `PRECHECK_MANUAL_TIMEOUT_MS` | env |
| Horn test window | 10 s | `HORN_TEST_WINDOW_MS` | env |
| Alert escalation | 15 s | `ALERT_ESCALATION_MS` | env |
| Black-box window (before and after) | 60 s | `BLACK_BOX_WINDOW_MS` | env |
| Idle-lesson threshold | 180 s | `IDLE_LESSON_AFTER_SEC` | env |
| Gemini request timeout | 25 s | `GEMINI_TIMEOUT_MS` | env |
| Telemetry history kept | 150 readings (~10 min at 4 s) | [telemetryStore.service.js:4](backend/src/services/telemetryStore.service.js#L4) | **no** |
| Audit log in memory | 500 docs | [repo.js:9](backend/src/db/repo.js#L9) | **no** |
| Firestore preload timeout | 12 s | [repo.js:10](backend/src/db/repo.js#L10) | **no** |
| Preloaded collections | 7 named collections | [repo.js:8](backend/src/db/repo.js#L8) | **no** |
| Live-pace minimum | 0.5 active minutes before a rate is used | [task.service.js:7](backend/src/services/task.service.js#L7) | **no** |
| MQTT reconnect / connect timeout | 3 s / 5 s | [mqtt.service.js](backend/src/services/mqtt.service.js) | **no** |
| Assistant: message length, history turns, tool rounds | 1000 chars, 8 turns, 5 rounds | [assistant.routes.js:6](backend/src/routes/assistant.routes.js#L6), [assistant.service.js:13-14](backend/src/services/assistant.service.js#L13-L14) | **no** |
| Assistant `getIncidents` default | last 7 days, max 20 | [assistant.service.js:146-149](backend/src/services/assistant.service.js#L146-L149) | **no** |
| List defaults | alerts 100, audit 100 (max 500) | [alert.service.js](backend/src/services/alert.service.js), [audit.routes.js](backend/src/routes/audit.routes.js) | **no** |
| Server port / host | 8000 / 0.0.0.0 | env | env |

## 6. Identifiers, enums and business vocabulary

| Item | Value | Where |
|---|---|---|
| Default (no-login) operator | `OP1001` | [operator.service.js:5](backend/src/services/operator.service.js#L5) |
| Supported languages | `en`, `hi`, `ta` | [operator.service.js:6](backend/src/services/operator.service.js#L6) |
| Shift states | 9 states | [shift.service.js:15-25](backend/src/services/shift.service.js#L15-L25) |
| Checklist items (6) and how each is verified | `SEATBELT_FASTENED` (sensor), `WALKAROUND_DONE`, `MIRRORS_ADJUSTED`, `PPE_WORN`, `AREA_CLEAR`, `HORN_TESTED` (machine event) | [shift.service.js:28-35](backend/src/services/shift.service.js#L28-L35) |
| Alert statuses | `ALERTED, ESCALATED, ACKNOWLEDGED` (open) → `RESOLVED` | [alert.service.js:10](backend/src/services/alert.service.js#L10) |
| Id formats | `ALR-<base36 time>-<rule prefix>`, `INC-…`, `SOS-…`, `MNT-…`, `<op>-<epoch ms>` for shifts | [alert.service.js:65](backend/src/services/alert.service.js#L65), [incident.service.js:60](backend/src/services/incident.service.js#L60) |
| Supervisor identity | the string `SUPERVISOR` (no supervisor accounts) | [incident.routes.js](backend/src/routes/incident.routes.js) |
| Assistant navigation targets | 12 targets → routes and section names | [assistant.service.js:20-33](backend/src/services/assistant.service.js#L20-L33) (mirror of the frontend's routes) |

## 7. Pre-check contract (shared with the simulator)

[precheck.service.js:7-12](backend/src/services/precheck.service.js#L7-L12)

- 15 sensor ids: `ENGINE_ECU, FUEL_SENSOR, HYDRAULIC_TEMP, ENGINE_TEMP, OIL_PRESSURE, VIBRATION, SEATBELT_SENSOR,
  SEAT_PRESENCE, GPS, PROXIMITY_FRONT, PROXIMITY_REAR, TILT_SENSOR, BRAKES, LIGHTS_HORN, CAMERA`.
- **Critical** ones (fail the pre-check): `ENGINE_ECU, BRAKES, SEATBELT_SENSOR, PROXIMITY_FRONT, PROXIMITY_REAR, TILT_SENSOR`.
- Overall verdict values: `PASS`, `PASS_WITH_WARNINGS`, `FAIL`.
- The OK / WARN / FAIL **grading thresholds themselves live in the simulator** ([sensors.js](../caterpillar-machine-simulator/src/sensors.js),
  e.g. fuel < 15 % = WARN); the backend only trusts the status it is sent. Risk 🟠: sensor list must match on both sides.

MQTT contract also fixed in code: topic names in [mqtt.service.js:9-16](backend/src/services/mqtt.service.js#L9-L16), command names
(`precheck`, `precheck-cancel`, `horn`, `shift`), the horn event type `'HORN'` ([shift.service.js](backend/src/services/shift.service.js)),
and the telemetry field names read by the rules (`seatbeltStatus`, `operatorPresent`, `hydraulicLockout`,
`nearestObjectDistanceM`, `tiltAngleDeg`, `boomHeightM`, `loadWeightKg`, `ratedCapacityKg`, `oilPressureKpa`, `impactG`,
`speedKph`, `parkingBrake`, `fuelLevelLitres`, `fuelConsumedLitres`, `idleTime`, `loadCycles`, `location`).

## 8. Text hard-coded in the backend

| Text | Where | Issue |
|---|---|---|
| Alert `reason` strings ("Seatbelt open while … for N s", "Person/object … m away — safe distance is … m") | [safety.engine.js](backend/src/services/safety.engine.js) | English only; the frontend translates by `code` + `params`, so these are a fallback. New rules need a translation added in three files. |
| Assistant system prompt (role, rules, module hints, dashboard flow, emergency advice) | [assistant.service.js:223-236](backend/src/services/assistant.service.js#L223-L236) | Module ids (`SIM_STARTUP` …) are written into the prompt; a new module is invisible to the assistant until the prompt is edited. |
| Assistant tool descriptions | [assistant.service.js:74-](backend/src/services/assistant.service.js#L74) | Part of the prompt contract. |
| "Normal ranges" the assistant quotes (`70-95 °C`, `60-90 °C`, `< 0.8`, `> 150 kPa`) | [assistant.service.js:68](backend/src/services/assistant.service.js#L68) | **Do not match the rule limits** (rules fire at 105 °C / 95 °C); operators could be told 95 °C is the top of normal while the alert fires at 105 °C. Risk 🟠. |
| Offline-mode replies and keyword regexes (EN/HI/TA keywords, English answers) | [assistant.service.js:314-](backend/src/services/assistant.service.js#L314) | Offline answers are English only. |
| Gemini endpoint and model names | [assistant.service.js:12](backend/src/services/assistant.service.js#L12), [env.js:38](backend/src/config/env.js) | Model names age quickly; defaults in code and `.env`. |
| Error messages | throughout | English. |
| Language display names | [assistant.service.js:16](backend/src/services/assistant.service.js#L16) | |

## 9. Values duplicated in more than one place

| Value | Places | Danger |
|---|---|---|
| Idle burn 4 L/h | assistant constant (`IDLE_BURN_LPH`) and the simulator/dataset's idle fuel rate | Backend does not read it from telemetry; if the simulator changes, the assistant's fuel-waste numbers are wrong. |
| Machine ids `EXC001–003` | [seed.js](backend/src/db/seed.js), [operators.json](backend/src/data/operators.json), the simulator (`AVAILABLE_MACHINES`), the ETA data generator | Adding a machine needs edits in four places. |
| 15 sensors + critical set | backend `precheck.service.js`, simulator `sensors.js`, frontend `SensorList.jsx` | Silent mismatch if one changes. |
| Working states, machine states | safety engine, [ML file](backend/src/ml/anomaly_ensemble.py) `STATES`, simulator, frontend | ETA dataset uses **`RUNNING` / `STOPPING`, which the simulator never emits**. |
| Overheating / vibration limits | safety engine (105 °C, 0.8 g), assistant "normal ranges", simulator scenario values, training-module numbers | See §8. |
| Assistant `NAV_TARGETS` | backend and frontend `assistant/useAssistantNavigation.js` | The backend comment points at a file (`assistant/navigation.js`) that does not exist. |
| 7-day window | training service and operator routes | Two constants. |
| Translation of alert codes | frontend `i18n/{en,hi,ta}.js`, keyed by backend rule ids | New rule id without translation shows raw code. |

## 10. Synthetic data used for ML and evaluation

| Item | Where | What is hard-coded |
|---|---|---|
| Anomaly dataset | `anomaly_detection_dataset.csv` (repo root), produced by the simulator's generator | 3 machines, 4 h 40 min, one day; each anomaly is a **flat step change** (engine 93 °C, vibration 1.12 g, fuel ×1.6, idle at 550 rpm); every machine has the same episode order. |
| ETA dataset | [ml/eta/data/](backend/src/ml/eta/data/) `train/validation/test.csv`, 50 000 rows | Generated by [generate_dataset.js](backend/src/ml/eta/data/generate_dataset.js) with seed 42: the target `eta_minutes` is **a hand-written formula** (base 8 min + state, load-cycle, rpm, fuel, idle, temperature, vibration, scenario effects, ÷ machine "efficiency", + noise σ 2.5, clamped 3–90). A model trained on it learns that formula, not real machine behaviour. |
| ETA model file | [ml/eta/model/eta_model.joblib](backend/src/ml/eta/model/) | Trained on the above; run live by `eta.service.js` for active tasks (the dashboard's Model ETA). |
| Anomaly ensemble parameters | [anomaly_ensemble.py](backend/src/ml/anomaly_ensemble.py) top | seed 42, 4 s sample period, 15-reading window, `UNKNOWN_CONF` 0.30, `VOTE_PCT` 0.995, `VOTES_NEEDED` 2, 5 sensors used, 6 states. |
| Detection scorecard expectations | [scripts/evaluateDetection.js:11-22](backend/src/scripts/evaluateDetection.js#L11-L22) | Which rule counts as a correct detection of which scenario. |

## 11. Secrets and configuration files

| File | Contents | Note |
|---|---|---|
| [backend/.env](backend/.env) | **Real** Firebase web config and Gemini API key | Gitignored ([backend/.gitignore](backend/.gitignore)), but this project is not a git repo yet — add `git init` **after** confirming `.env` is ignored. Both keys were shared in chat: rotate after the event. |
| [backend/.env.example](backend/.env.example) | Same keys, empty | Safe to commit. |
| Firestore rules | Test mode (set in the Firebase console, not in this repo) | Any client with the web config can read and write every collection until rules are added. |
| Firebase web config | `apiKey`, `projectId`, … | Web keys are not secret by design; protection must come from Firestore rules and App Check. |

## 12. Suggested clean-up order

1. **Safety thresholds → one config object** (`config/safety.js`, overridable per machine model and per site) — §2.
   Then make the assistant's "normal ranges" read from it (§8) so the two can never disagree.
2. **Machines, operators, tasks → Firestore only**; keep JSON as first-run seed. Add a per-machine `fuelTankL` and
   `ratedCapacityKg` — §1, §3.
3. **Scoring, XP, CO₂, badge rules → `config/scoring.js`** — §3.
4. **Rule→module mapping into `trainingModules.json`** (`triggers`) and build the assistant prompt's module hints from
   the module list — §4, §8.
5. **Idle burn rate learned from telemetry** (median fuel rate while `IDLE`) instead of 4 L/h — §3, §9.
6. **Share the contracts** (sensor ids, states, topics) through a single `contracts.json` read by backend, simulator and
   frontend — §7, §9.
7. Replace the ETA target formula with data recorded from the live simulator before using that model — §10.
8. Rotate keys, tighten Firestore rules, then `git init` — §11.
