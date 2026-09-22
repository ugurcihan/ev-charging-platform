// OCPI 2.2.1 — the CPO (Charge Point Operator) roaming interface: lets
// third-party eMSP apps register and pull Locations, Sessions and CDRs.
// Returns an Express router plus a getState() for the dashboard.

const express = require('express');
const crypto = require('crypto');

function newToken(prefix) {
  return `${prefix}-${crypto.randomBytes(12).toString('hex')}`;
}

const CPO_PARTY = { role: 'CPO', business_details: { name: 'Gridspark' }, party_id: 'GRS', country_code: 'TR' };

function createRoamingNetwork({ basePath }) {
  const tokenA = process.env.TOKEN_A || newToken('tokenA');
  const partners = new Map(); // tokenB -> { partyId, name, countryCode, tokenB, tokenC, registeredAt }
  const locations = [
    {
      id: 'LOC-DOWNTOWN', type: 'PARKING_LOT', name: 'Downtown Fast Charge Hub',
      address: '142 Riverside Ave', city: 'Istanbul', country: 'TUR',
      coordinates: { latitude: '41.0369', longitude: '28.9850' },
      evses: [{
        uid: 'EVSE-DT-1', evse_id: 'TR*GRS*E000001', status: 'AVAILABLE',
        connectors: [{ id: '1', standard: 'IEC_62196_T2_COMBO', format: 'CABLE', power_type: 'DC', max_voltage: 500, max_amperage: 300 }],
      }],
      last_updated: new Date().toISOString(),
    },
    {
      id: 'LOC-RETAILPARK', type: 'PARKING_LOT', name: 'Retail Park Charging Bay',
      address: '58 Market Square', city: 'Istanbul', country: 'TUR',
      coordinates: { latitude: '40.9906', longitude: '29.0284' },
      evses: [{
        uid: 'EVSE-RP-1', evse_id: 'TR*GRS*E000002', status: 'CHARGING',
        connectors: [{ id: '1', standard: 'IEC_62196_T2', format: 'SOCKET', power_type: 'AC_3_PHASE', max_voltage: 400, max_amperage: 32 }],
      }],
      last_updated: new Date().toISOString(),
    },
  ];
  const sessions = new Map();
  const cdrs = [];
  const eventLog = [];

  function logEvent(actor, action, detail) {
    eventLog.unshift({ ts: new Date().toISOString(), actor, action, detail });
    if (eventLog.length > 200) eventLog.pop();
  }

  function ocpiResponse(res, data, statusCode = 1000, message = '') {
    res.json({ status_code: statusCode, status_message: message, data, timestamp: new Date().toISOString() });
  }

  function parseToken(req) {
    const match = (req.headers.authorization || '').match(/^Token (.+)$/);
    return match ? match[1] : null;
  }

  function requireTokenA(req, res, next) {
    if (parseToken(req) !== tokenA) return res.status(401).json({ status_code: 2000, status_message: 'Invalid or missing credentials token' });
    next();
  }

  function requirePartner(req, res, next) {
    const token = parseToken(req);
    const partner = [...partners.values()].find((p) => p.tokenC === token);
    if (!partner) return res.status(401).json({ status_code: 2000, status_message: 'Invalid or missing credentials token' });
    req.partner = partner;
    next();
  }

  const router = express.Router();

  router.get('/versions', requireTokenA, (req, res) => {
    logEvent('unregistered-party', 'GET /versions', {});
    ocpiResponse(res, [{ version: '2.2.1', url: `${basePath}/2.2.1/details` }]);
  });

  router.get('/2.2.1/details', (req, res) => {
    ocpiResponse(res, {
      version: '2.2.1',
      endpoints: [
        { identifier: 'credentials', role: 'RECEIVER', url: `${basePath}/2.2.1/credentials` },
        { identifier: 'locations', role: 'SENDER', url: `${basePath}/cpo/locations` },
        { identifier: 'sessions', role: 'SENDER', url: `${basePath}/cpo/sessions` },
        { identifier: 'cdrs', role: 'SENDER', url: `${basePath}/cpo/cdrs` },
      ],
    });
  });

  router.post('/2.2.1/credentials', requireTokenA, (req, res) => {
    const { token: tokenB, roles } = req.body || {};
    const emspRole = (roles || []).find((r) => r.role === 'EMSP');
    if (!tokenB || !emspRole) return res.status(400).json({ status_code: 2001, status_message: 'Missing token or EMSP role' });

    const tokenC = newToken('tokenC');
    partners.set(tokenB, {
      partyId: emspRole.party_id, name: emspRole.business_details?.name || emspRole.party_id,
      countryCode: emspRole.country_code, tokenB, tokenC, registeredAt: new Date().toISOString(),
    });
    logEvent(emspRole.party_id, 'POST /credentials (registration)', { partyId: emspRole.party_id });
    ocpiResponse(res, { token: tokenC, url: `${basePath}/versions`, roles: [CPO_PARTY] });
  });

  router.get('/cpo/locations', requirePartner, (req, res) => {
    logEvent(req.partner.partyId, 'GET /locations', {});
    ocpiResponse(res, locations);
  });

  router.get('/cpo/locations/:id', requirePartner, (req, res) => {
    const loc = locations.find((l) => l.id === req.params.id);
    if (!loc) return res.status(404).json({ status_code: 2003, status_message: 'Location not found' });
    ocpiResponse(res, loc);
  });

  router.get('/cpo/sessions', requirePartner, (req, res) => {
    logEvent(req.partner.partyId, 'GET /sessions', {});
    ocpiResponse(res, [...sessions.values()]);
  });

  router.get('/cpo/cdrs', requirePartner, (req, res) => {
    logEvent(req.partner.partyId, 'GET /cdrs', {});
    ocpiResponse(res, cdrs);
  });

  router.post('/simulate-session', (req, res) => {
    const location = locations[Math.floor(Math.random() * locations.length)];
    const energyKwh = +(15 + Math.random() * 25).toFixed(2);
    const pricePerKwh = 8.5;
    const startedAt = new Date(Date.now() - 20 * 60 * 1000);
    const endedAt = new Date();

    const sessionId = `SES-${Date.now()}`;
    sessions.set(sessionId, {
      id: sessionId, start_date_time: startedAt.toISOString(), end_date_time: endedAt.toISOString(),
      location_id: location.id, evse_uid: location.evses[0].uid, kwh: energyKwh, currency: 'TRY', status: 'COMPLETED',
    });

    const cdrId = `CDR-${Date.now()}`;
    const exclVat = +(energyKwh * pricePerKwh).toFixed(2);
    const cdr = {
      id: cdrId, start_date_time: startedAt.toISOString(), end_date_time: endedAt.toISOString(),
      cdr_token: { uid: 'DEMO-RFID-0001', type: 'RFID', contract_id: 'TR-PAR-C00001' },
      auth_method: 'WHITELIST', location_id: location.id, currency: 'TRY',
      total_energy: energyKwh, total_cost: { excl_vat: exclVat, incl_vat: +(exclVat * 1.2).toFixed(2) },
      last_updated: endedAt.toISOString(),
    };
    cdrs.unshift(cdr);
    logEvent('CPO', 'Session settled -> CDR issued', { sessionId, cdrId, kwh: energyKwh });
    res.json({ session: sessions.get(sessionId), cdr });
  });

  function getState() {
    return {
      partners: [...partners.values()].map((p) => ({ partyId: p.partyId, name: p.name, registeredAt: p.registeredAt })),
      locations,
      sessions: [...sessions.values()],
      cdrs: cdrs.slice(0, 30),
      events: eventLog.slice(0, 40),
    };
  }

  return { router, getState, tokenA };
}

module.exports = { createRoamingNetwork, CPO_PARTY };
