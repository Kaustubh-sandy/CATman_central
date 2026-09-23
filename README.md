# CAT Smart Operator - Machine Simulator & Backend (Repository 1)

This repository serves as **Repository 1** for the **CAT Smart Operator** system: a real-time telemetry ingestion backend and multi-machine simulator designed for construction equipment (Caterpillar excavators).

---

## 1. What This Repository Does

- **Simulates Machines**: A lightweight simulation running two CAT machines (`EXC001` and `EXC002`) generating live operational metrics (engine hours, fuel used, load cycles, idle time, seatbelt status).
- **Central Telemetry API**: Exposes Express REST APIs to ingest machine telemetry, validate incoming metrics, and verify machine registration.
- **Persistent Storage**: Stores machines and time-series telemetry records in **Firebase Firestore** using the Firebase Admin SDK.
- **Real-Time Broadcasting**: Emits live telemetry events over **Socket.IO** (`machine:telemetry`) so connected clients (such as the Operator Application in Repository 2) receive instantaneous updates.

---

## 2. Architecture

```
                    MACHINE REPOSITORY (Repository 1)

       ┌────────────────────────────────────────────────────────┐
       │               Machine Simulator                        │
       │                                                        │
       │     EXC001                           EXC002            │
       │        │                               │               │
       └────────┼───────────────────────────────┼───────────────┘
                │                               │
                │ HTTP POST /api/telemetry      │ HTTP POST /api/telemetry
                ▼                               ▼
       ┌────────────────────────────────────────────────────────┐
       │                Node.js Express Backend                 │
       │                                                        │
       │   Routes -> Validation -> Persistence -> Socket.IO     │
       └────────────────────────┬───────────────────────────────┘
                                │
                      ┌─────────┴─────────┐
                      │                   │
                      ▼                   ▼
                 Firebase              Socket.IO
                 Firestore             Server
                                          │
                                          │ event: "machine:telemetry"
                                          ▼
                                   Operator App
                                  (Repository 2)
```

> **Key Rule**: The machine simulator does NOT write directly to Firebase. The future React Operator App does NOT write directly to Firestore. The Node.js backend is the central authority.

---

## 3. Requirements

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Firebase Project**: A Google Cloud / Firebase account with Firestore Database enabled.

---

## 4. Repository Structure

```
cat-machine-backend/
├── src/
│   ├── server.js                      # Express HTTP & Socket.IO server entrypoint
│   ├── simulator/
│   │   └── machineSimulator.js        # Simulates EXC001 & EXC002 telemetry
│   ├── routes/
│   │   ├── health.routes.js           # GET /api/health
│   │   ├── machine.routes.js          # GET /api/machines & /api/machines/:machineId
│   │   └── telemetry.routes.js        # POST /api/telemetry
│   ├── controllers/
│   │   ├── machine.controller.js      # Machine request handlers
│   │   └── telemetry.controller.js    # Telemetry validation & broadcast handler
│   ├── services/
│   │   ├── firebase.service.js        # Firebase Admin SDK & Firestore connection
│   │   ├── machine.service.js         # Machine querying & seeding logic
│   │   └── telemetry.service.js       # Telemetry Firestore persistence
│   ├── socket/
│   │   └── socket.js                  # Socket.IO lifecycle & broadcasting
│   ├── scripts/
│   │   └── seed.js                    # Seeding CLI for initial machines
│   └── config/
│       └── env.js                     # Environment variables configuration
├── .env.example                       # Template for environment configuration
├── .env                               # Local environment file (gitignored)
├── .gitignore                         # Git exclusion rules
├── package.json                       # Dependencies & scripts
└── README.md                          # Documentation
```

---

## 5. Firebase & Firestore Setup

### Step A: Create Firebase Project
1. Visit the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and name it (e.g. `cat-smart-operator`).
3. Under **Build**, select **Firestore Database** and click **Create database**.
4. Choose your preferred region and start in **Production mode** (or Test mode).

### Step B: Generate Service Account Key
1. Go to **Project Settings** (gear icon) -> **Service accounts**.
2. Select **Firebase Admin SDK** (Node.js).
3. Click **Generate new private key** and download the JSON file.

### Step C: Extract Credentials for `.env`
Open the downloaded JSON file and copy the values:
- `project_id` -> `FIREBASE_PROJECT_ID`
- `client_email` -> `FIREBASE_CLIENT_EMAIL`
- `private_key` -> `FIREBASE_PRIVATE_KEY` (keep quotes around it if it spans multiple lines, or leave standard `\n` characters).

> **Never commit your service account JSON or private key to Git.**

---

## 6. Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Configure the variables inside `.env`:

```env
# Server
PORT=8000
HOST=0.0.0.0
CLIENT_URL=http://localhost:5173

# Simulator
API_BASE_URL=http://localhost:8000
SIMULATOR_INTERVAL_MS=4000

# Firebase Firestore (from Service Account Key)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkq...YOUR_KEY...\n-----END PRIVATE KEY-----\n"
```

> **Note**: If Firebase credentials are not yet added, the backend will still boot and provide `/api/health` and an in-memory fallback store for offline testing.

---

## 7. Installing Dependencies

Inside the project directory:

```bash
npm install
```

---

## 8. Initializing Machines in Firestore

To ensure machines `EXC001` and `EXC002` exist in Firestore, run:

```bash
npm run seed
```

This checks Firestore `machines` collection. If the machines do not already exist, it creates documents `machines/EXC001` and `machines/EXC002`. Existing documents are never duplicated.

---

## 9. Running the Backend

### Development Mode (with hot-reload via nodemon):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The server binds to `0.0.0.0:8000`, making it accessible on `http://localhost:8000` or across the local network using `http://<YOUR_LOCAL_IP>:8000`.

---

## 10. Running the Machine Simulator

In a separate terminal:

```bash
npm run simulator
```

The simulator will start emitting telemetry for `EXC001` and `EXC002` every 4 seconds to `POST http://localhost:8000/api/telemetry`.

---

## 11. API Reference & Testing

### 1. Health Check
```bash
curl http://localhost:8000/api/health
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "cat-machine-backend"
}
```

### 2. Get All Machines
```bash
curl http://localhost:8000/api/machines
```
**Response (200 OK):**
```json
{
  "count": 2,
  "machines": [
    {
      "id": "EXC001",
      "machineId": "EXC001",
      "name": "Excavator 001",
      "type": "Hydraulic Excavator"
    },
    {
      "id": "EXC002",
      "machineId": "EXC002",
      "name": "Excavator 002",
      "type": "Hydraulic Excavator"
    }
  ]
}
```

### 3. Get Single Machine
```bash
curl http://localhost:8000/api/machines/EXC001
```

### 4. Send Telemetry
```bash
curl -X POST http://localhost:8000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "machineId": "EXC001",
    "engineHours": 1526.5,
    "fuelUsed": 6.1,
    "loadCycles": 10,
    "idleTime": 15,
    "seatbeltStatus": true
  }'
```
**Response (201 Created):**
```json
{
  "id": "docIdOrGeneratedId",
  "machineId": "EXC001",
  "engineHours": 1526.5,
  "fuelUsed": 6.1,
  "loadCycles": 10,
  "idleTime": 15,
  "seatbeltStatus": true,
  "timestamp": "2026-09-23T10:15:00.000Z"
}
```

---

## 12. Socket.IO & Operator Application Connection

The backend integrates Socket.IO on the same HTTP server (`http://localhost:8000`).

### Event: `machine:telemetry`
Every time `POST /api/telemetry` is received by the backend, it emits `machine:telemetry` with the newly saved telemetry object.

### Connecting from the React Operator App (Repository 2):
In the frontend application:

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:8000", {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("Connected to CAT Machine Backend Socket.IO server!");
});

socket.on("machine:telemetry", (data) => {
  console.log("Live Telemetry Received:", data);
  // Example update:
  // updateMachineCard(data.machineId, data);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});
```

---

## 13. Telemetry Verification Flow

To verify the complete end-to-end pipeline:

1. **Terminal 1**: Start the backend:
   ```bash
   npm run dev
   ```
2. **Terminal 2**: (Optional) Run the seeding script:
   ```bash
   npm run seed
   ```
3. **Terminal 3**: Launch the machine simulator:
   ```bash
   npm run simulator
   ```
4. Observe the simulator logging outgoing telemetry requests and HTTP 201 responses.
5. In Terminal 1, observe the backend receiving the telemetry, persisting it, and emitting `machine:telemetry`.
