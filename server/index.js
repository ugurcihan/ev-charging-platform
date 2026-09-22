// Single-process EV charging network backend: OCPP 1.6-J station
// communication (WebSocket) and OCPI 2.2.1 roaming (REST), served together
// with one operations console — the way a real CPO platform exposes both
// interfaces from the same backend.

const express = require('express');
const path = require('path');
const { createStationNetwork } = require('./ocpp-station');
const { createRoamingNetwork } = require('./ocpi-roaming');

const PORT = process.env.PORT || 9230;
// The hostname OCPI discovery responses (GET /ocpi/versions, /2.2.1/details)
// advertise as the base for all subsequent calls. Defaults to localhost for
// local dev, but a roaming partner reaching this service from a different
// host or container (e.g. another service in the same Docker network) needs
// the real, resolvable hostname here instead.
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'localhost';
const OCPI_BASE = `http://${PUBLIC_HOST}:${PORT}/ocpi`;

const stations = createStationNetwork();
const roaming = createRoamingNetwork({ basePath: OCPI_BASE });

const app = express();
app.use(express.json());
app.use('/ocpi', roaming.router);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/state', (req, res) => {
  res.json({ ocpp: stations.getState(), ocpi: roaming.getState() });
});

const server = app.listen(PORT, () => {
  console.log(`Gridspark listening on http://localhost:${PORT}`);
  console.log(`  Charge points connect at ws://localhost:${PORT}/ocpp/<chargePointId>`);
  console.log(`  OCPI roaming base:      http://localhost:${PORT}/ocpi`);
  console.log(`  Roaming registration token (Token A): ${roaming.tokenA}`);
});

server.on('upgrade', (req, socket, head) => {
  const match = req.url.match(/^\/ocpp\/([^/?]+)/);
  if (!match) { socket.destroy(); return; }
  stations.handleUpgrade(req, socket, head, decodeURIComponent(match[1]));
});
