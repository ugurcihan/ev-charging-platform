// OCPP-J (JSON over WebSocket) framing — OCPP 1.6 Part 4.

const MESSAGE_TYPE = { CALL: 2, CALLRESULT: 3, CALLERROR: 4 };

function encodeCallResult(id, payload) {
  return JSON.stringify([MESSAGE_TYPE.CALLRESULT, id, payload]);
}

function encodeCallError(id, code, description) {
  return JSON.stringify([MESSAGE_TYPE.CALLERROR, id, code, description, {}]);
}

function decode(raw) {
  const frame = JSON.parse(raw);
  const [type] = frame;
  if (type === MESSAGE_TYPE.CALL) {
    const [, id, action, payload] = frame;
    return { type: 'CALL', id, action, payload };
  }
  if (type === MESSAGE_TYPE.CALLRESULT) {
    const [, id, payload] = frame;
    return { type: 'CALLRESULT', id, payload };
  }
  if (type === MESSAGE_TYPE.CALLERROR) {
    const [, id, code, description] = frame;
    return { type: 'CALLERROR', id, code, description };
  }
  throw new Error(`Unknown OCPP message type: ${type}`);
}

module.exports = { MESSAGE_TYPE, encodeCallResult, encodeCallError, decode };
