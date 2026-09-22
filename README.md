# Gridspark

A from-scratch EV charging network backend covering both protocols a real
charging network runs on: **OCPP 1.6-J** for talking to physical charge
points, and **OCPI 2.2.1** for roaming — letting third-party apps sell access
to the network. Both run from a single process with a live operations
console.

I built this to go deep on the protocol layer of EV charging infrastructure
rather than just the app layer — the WebSocket session lifecycle a charger
actually speaks, and the REST handshake two charging networks use to
interoperate.

## What it implements

**OCPP (charge point ↔ platform)** — the full session lifecycle:

```
Charge Point                        Platform
    |--- BootNotification -------------->|
    |<-- Accepted, heartbeat interval ---|
    |--- StatusNotification (Available)->|
    |--- Authorize (idTag) ------------->|
    |<-- Accepted ------------------------|
    |--- StartTransaction --------------->|
    |<-- transactionId -------------------|
    |--- MeterValues (x N, periodic) ---->|
    |--- StopTransaction ----------------->|
    |<-- Accepted -------------------------|
```

Message framing follows OCPP-J exactly: `[2, uniqueId, action, payload]` for
CALL, `[3, uniqueId, payload]` for CALLRESULT (`server/ocpp-frame.js`).
Charge points connect at `ws://<host>/ocpp/<chargePointId>`, the path
convention real charging hardware expects.

**OCPI (platform ↔ roaming partner)** — the real registration handshake:

```
eMSP (roaming partner)                  Platform
    |--- GET /versions  (Token A) -------------->|
    |<-- supported versions ----------------------|
    |--- GET /2.2.1/details ---------------------->|
    |<-- module endpoint list ---------------------|
    |--- POST /credentials (Token A, my Token B) ->|
    |<-- Token C, platform party info --------------|
    |--- GET /cpo/locations   (Token C) ---------->|
    |--- GET /cpo/cdrs        (Token C) ---------->|
```

Token A is the pre-shared "invite" a platform hands a new roaming partner
out-of-band. Token B/C are the pair of tokens each side issues the other
during registration — every call after that is authenticated with them, not
Token A. Modules covered: **Credentials** (registration), **Locations**,
**Sessions**, and **CDRs** — the settlement record a platform sends a
roaming partner to bill for a completed session (`server/ocpi-roaming.js`).

## Run it

```bash
npm install
npm start                                          # platform + console on :9230
                                                    # prints a Token A on boot
npm run simulate:charger                           # in another terminal
npm run simulate:roaming -- http://localhost:9230 <token-A-from-above>
```

Open `http://localhost:9230` — the **Charging Network** tab shows live
charge points and transactions, the **Roaming Partners** tab shows registered
partners and settled CDRs. `POST /ocpi/simulate-session` generates a demo
roaming session + CDR without needing a live charger session.

### Docker

```bash
docker compose up --build
```

Runs the platform, a simulated charge point, and a simulated roaming partner
as separate services, with a fixed demo Token A so the registration
handshake completes automatically.

## Why this design

- **One process, two protocols** — mirrors how a real charging network
  backend works: the same platform that talks to its own hardware over OCPP
  also exposes an OCPI interface to the outside world. Splitting them into
  separate services would hide that relationship, not clarify it.
- **In-memory state** — a production platform persists this (Postgres for
  meter values and CDRs, Redis for live connection state); kept in-memory
  here so the protocol handling stays the focus, not a database layer.
- **Express for OCPI, raw WebSocket for OCPP** — OCPI is a wide REST/JSON
  surface where a router earns its keep; OCPP is a single persistent
  connection per charge point, where framing it by hand is what actually
  demonstrates understanding the protocol.

## Scope

Covers the core OCPP transaction flow (Boot, Status, Authorize, Start/Stop
Transaction, MeterValues, Heartbeat) and the core OCPI flow (registration,
Locations, Sessions, CDRs) — enough to show real protocol fluency end to end.
It does not implement the full OCPP 1.6 action set (Reset,
RemoteStartTransaction, Smart Charging profiles), OCPP 2.0.1, or the rest of
OCPI (Tariffs, Tokens whitelist sync, Commands, push-model callbacks) —
deliberately, to keep this a focused protocol deep-dive rather than a
production-scale platform.
