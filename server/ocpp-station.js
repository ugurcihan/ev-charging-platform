// OCPP 1.6-J station management — the charge point <-> CSMS side.
// Charge points connect at ws://<host>/ocpp/<chargePointId>, the path
// convention real charging hardware expects, and speak real OCPP-J frames.

const { WebSocketServer } = require('ws');
const { encodeCallResult, encodeCallError, decode } = require('./ocpp-frame');

function createStationNetwork() {
  const chargePoints = new Map(); // id -> { status, connectorStatus, vendor, model, lastHeartbeat }
  const transactions = new Map(); // transactionId -> {...}
  const eventLog = [];
  let nextTransactionId = 1000;

  function logEvent(cpId, action, detail) {
    eventLog.unshift({ ts: new Date().toISOString(), cpId, action, detail });
    if (eventLog.length > 200) eventLog.pop();
  }

  const wss = new WebSocketServer({ noServer: true });

  function handleUpgrade(req, socket, head, cpId) {
    wss.handleUpgrade(req, socket, head, (ws) => onConnected(cpId, ws));
  }

  function onConnected(cpId, ws) {
    chargePoints.set(cpId, {
      status: 'Connected', connectorStatus: 'Unavailable',
      vendor: null, model: null, lastHeartbeat: new Date().toISOString(),
    });
    logEvent(cpId, 'WebSocketConnected', {});

    ws.on('message', (raw) => handleMessage(cpId, ws, raw.toString()));
    ws.on('close', () => {
      const cp = chargePoints.get(cpId);
      if (cp) cp.status = 'Disconnected';
      logEvent(cpId, 'WebSocketClosed', {});
    });
  }

  function handleMessage(cpId, ws, raw) {
    let msg;
    try { msg = decode(raw); } catch (e) { logEvent(cpId, 'DecodeError', { error: e.message }); return; }
    if (msg.type !== 'CALL') return;

    const cp = chargePoints.get(cpId);
    const { id, action, payload } = msg;

    switch (action) {
      case 'BootNotification': {
        cp.vendor = payload.chargePointVendor;
        cp.model = payload.chargePointModel;
        cp.status = 'Accepted';
        logEvent(cpId, 'BootNotification', payload);
        ws.send(encodeCallResult(id, { status: 'Accepted', currentTime: new Date().toISOString(), interval: 60 }));
        break;
      }
      case 'Heartbeat': {
        cp.lastHeartbeat = new Date().toISOString();
        ws.send(encodeCallResult(id, { currentTime: cp.lastHeartbeat }));
        break;
      }
      case 'StatusNotification': {
        cp.connectorStatus = payload.status;
        logEvent(cpId, 'StatusNotification', payload);
        ws.send(encodeCallResult(id, {}));
        break;
      }
      case 'Authorize': {
        logEvent(cpId, 'Authorize', payload);
        ws.send(encodeCallResult(id, { idTagInfo: { status: 'Accepted' } }));
        break;
      }
      case 'StartTransaction': {
        const transactionId = nextTransactionId++;
        transactions.set(transactionId, {
          cpId, idTag: payload.idTag, connectorId: payload.connectorId,
          startMeter: payload.meterStart, startedAt: new Date().toISOString(),
          meterValues: [], status: 'Active',
        });
        cp.connectorStatus = 'Charging';
        logEvent(cpId, 'StartTransaction', { transactionId, ...payload });
        ws.send(encodeCallResult(id, { transactionId, idTagInfo: { status: 'Accepted' } }));
        break;
      }
      case 'MeterValues': {
        const tx = transactions.get(payload.transactionId);
        if (tx) tx.meterValues.push(...(payload.meterValue || []));
        logEvent(cpId, 'MeterValues', payload);
        ws.send(encodeCallResult(id, {}));
        break;
      }
      case 'StopTransaction': {
        const tx = transactions.get(payload.transactionId);
        if (tx) {
          tx.status = 'Completed';
          tx.stopMeter = payload.meterStop;
          tx.stoppedAt = new Date().toISOString();
          tx.energyKwh = ((payload.meterStop - tx.startMeter) / 1000).toFixed(2);
        }
        cp.connectorStatus = 'Available';
        logEvent(cpId, 'StopTransaction', payload);
        ws.send(encodeCallResult(id, { idTagInfo: { status: 'Accepted' } }));
        break;
      }
      default: {
        ws.send(encodeCallError(id, 'NotImplemented', `Unhandled action: ${action}`));
        logEvent(cpId, 'UnhandledAction', { action });
      }
    }
  }

  function getState() {
    return {
      chargePoints: [...chargePoints.entries()].map(([id, cp]) => ({ id, ...cp })),
      transactions: [...transactions.entries()].map(([txId, tx]) => ({ txId, ...tx })),
      events: eventLog.slice(0, 40),
    };
  }

  return { handleUpgrade, getState };
}

module.exports = { createStationNetwork };
