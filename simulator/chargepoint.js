// Simulates a real charge point's OCPP 1.6-J session lifecycle: connect ->
// BootNotification -> StatusNotification -> Authorize -> StartTransaction
// -> periodic MeterValues -> StopTransaction.
// Usage: node simulator/chargepoint.js [chargePointId] [platformUrl]

const WebSocket = require('ws');

const CP_ID = process.argv[2] || `CP-${Math.floor(Math.random() * 900 + 100)}`;
const BASE_URL = process.argv[3] || `ws://localhost:${process.env.PORT || 9230}`;
const url = `${BASE_URL}/ocpp/${CP_ID}`;

let seq = 1;
const pending = new Map();

function call(ws, action, payload) {
  const id = `${CP_ID}-${seq++}`;
  pending.set(id, action);
  ws.send(JSON.stringify([2, id, action, payload]));
  console.log(`[${CP_ID}] -> ${action}`, payload);
  return id;
}

function connect() {
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`[${CP_ID}] connected to ${url}`);
    call(ws, 'BootNotification', {
      chargePointVendor: 'ABB',
      chargePointModel: 'Terra 184 DC Fast Charger',
      firmwareVersion: '3.2.1',
    });
  });

  ws.on('message', (raw) => {
    const frame = JSON.parse(raw.toString());
    const [type, id, payloadOrAction] = frame;
    if (type !== 3) return;
    const action = pending.get(id);
    pending.delete(id);
    console.log(`[${CP_ID}] <- ${action || '?'} result`, payloadOrAction);

    if (action === 'BootNotification') {
      call(ws, 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });
      setTimeout(() => startSession(ws), 800);
    }
    if (action === 'Authorize') startTransaction(ws);
    if (action === 'StartTransaction') streamMeterValues(ws, payloadOrAction.transactionId);
  });

  ws.on('close', () => console.log(`[${CP_ID}] connection closed`));
  ws.on('error', (err) => console.error(`[${CP_ID}] error:`, err.message));

  return ws;
}

let meterWh = 0;

function startSession(ws) {
  ws.__idTag = 'DEMO-RFID-0001';
  call(ws, 'Authorize', { idTag: ws.__idTag });
}

function startTransaction(ws) {
  meterWh = 0;
  call(ws, 'StartTransaction', {
    connectorId: 1,
    idTag: ws.__idTag || 'DEMO-RFID-0001',
    meterStart: meterWh,
    timestamp: new Date().toISOString(),
  });
}

function streamMeterValues(ws, transactionId) {
  console.log(`[${CP_ID}] charging started, transactionId=${transactionId}`);
  let ticks = 0;
  const interval = setInterval(() => {
    ticks += 1;
    meterWh += 7500;
    call(ws, 'MeterValues', {
      connectorId: 1,
      transactionId,
      meterValue: [{
        timestamp: new Date().toISOString(),
        sampledValue: [{ value: String(meterWh), unit: 'Wh', measurand: 'Energy.Active.Import.Register' }],
      }],
    });
    if (ticks >= 4) {
      clearInterval(interval);
      setTimeout(() => stopTransaction(ws, transactionId), 1000);
    }
  }, 1500);
}

function stopTransaction(ws, transactionId) {
  call(ws, 'StopTransaction', {
    transactionId,
    idTag: ws.__idTag || 'DEMO-RFID-0001',
    meterStop: meterWh,
    timestamp: new Date().toISOString(),
    reason: 'Local',
  });
  console.log(`[${CP_ID}] session complete — ${(meterWh / 1000).toFixed(2)} kWh delivered`);
}

connect();
