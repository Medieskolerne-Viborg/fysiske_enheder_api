// ─────────────────────────────────────────────────────────────────────────
//  Fysiske Enheder — API til undervisning (ESP32 + React)
//
//  Ét fælles, offentligt API som både React-apps OG ESP32'er taler med.
//  Ingen database: al tilstand ligger i hukommelsen (nulstilles ved genstart).
//
//  ELEV-ID ("rum"): hver elev bruger sit eget id via ?id=<navn> i URL'en,
//  så ingen overskriver hinanden. Uden id bruges rummet "demo".
//    fx:  GET /led?id=anne     PUT /display?id=anne
//
//  Svarformat overalt:  { status: "ok" | "error", message, data }
// ─────────────────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors()); // React (browser) må kalde API'et. ESP32 er ligeglad med CORS.

const PORT = process.env.PORT || 3055;

const LED_COLORS = ["red", "yellow", "green", "off", "on", "blink"];

// ── Ét "rum" (state) pr. elev-id ────────────────────────────────────────────
const rooms = new Map();

function newRoom() {
  return {
    display: { text: "Hej fra skyen" },
    led: { color: "off" },
    button: { count: 0, lastPressed: null },
    sensor: { value: null, updated: null },     // fx temperatur
    distance: { value: null, updated: null },   // fx afstandsmåler (cm)
  };
}

// Find (eller opret) rummet for dette kald ud fra ?id=. Standard: "demo".
function room(req) {
  const id = String(req.query.id || "demo").slice(0, 40);
  if (!rooms.has(id)) rooms.set(id, newRoom());
  return rooms.get(id);
}

// Lille hjælper, så alle svar ser ens ud.
const ok = (res, data, message = "ok") =>
  res.status(200).send({ status: "ok", message, data });
const fail = (res, code, message) =>
  res.status(code).send({ status: "error", message, data: {} });

// ── Forside / health ───────────────────────────────────────────────────────
app.get("/", (req, res) => {
  ok(res, {
    hint: "Brug ?id=<dit-navn> så du har dit eget rum, fx /led?id=anne",
    rooms: rooms.size,
    endpoints: [
      "GET  /display", "PUT  /display   { text }",
      "GET  /led", "PUT  /led       { color }",
      "GET  /button", "POST /button/press",
      "GET  /sensor", "PUT  /sensor    { value }",
      "GET  /distance", "PUT  /distance { value }",
    ],
  }, "Fysiske Enheder API kører");
});

// ── DISPLAY (tekst til OLED) — React skriver, ESP32 læser ───────────────────
app.get("/display", (req, res) => ok(res, { text: room(req).display.text }));

app.put("/display", (req, res) => {
  const { text } = req.body;
  if (typeof text !== "string" || text.trim() === "") {
    return fail(res, 400, "Feltet 'text' skal være en tekst");
  }
  const r = room(req);
  r.display.text = text.trim();
  ok(res, { text: r.display.text }, "Display opdateret");
});

// ── LED (farve) — React sætter, ESP32 læser og tænder ───────────────────────
app.get("/led", (req, res) => ok(res, { color: room(req).led.color }));

app.put("/led", (req, res) => {
  const { color } = req.body;
  if (!LED_COLORS.includes(color)) {
    return fail(res, 400, `'color' skal være en af: ${LED_COLORS.join(", ")}`);
  }
  const r = room(req);
  r.led.color = color;
  ok(res, { color: r.led.color }, "LED opdateret");
});

// ── KNAP (input) — ESP32 melder tryk, React læser tælleren ──────────────────
app.get("/button", (req, res) => {
  const b = room(req).button;
  ok(res, { count: b.count, lastPressed: b.lastPressed });
});

app.post("/button/press", (req, res) => {
  const r = room(req);
  r.button.count += 1;
  r.button.lastPressed = new Date().toISOString();
  ok(res, { count: r.button.count, lastPressed: r.button.lastPressed }, "Tryk registreret");
});

// Nulstil tælleren (fx fra React).
app.delete("/button", (req, res) => {
  const r = room(req);
  r.button = { count: 0, lastPressed: null };
  ok(res, r.button, "Tæller nulstillet");
});

// ── SENSOR (input) — ESP32 sender en måling, React læser den ────────────────
app.get("/sensor", (req, res) => {
  const s = room(req).sensor;
  ok(res, { value: s.value, updated: s.updated });
});

app.put("/sensor", (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return fail(res, 400, "Feltet 'value' skal være et tal");
  }
  const r = room(req);
  r.sensor = { value, updated: new Date().toISOString() };
  ok(res, r.sensor, "Sensor opdateret");
});

// ── DISTANCE (input) — fx afstandsmåler (URM13). Samme form som /sensor, ────
//    men holdt adskilt, så en enhed kan sende BÅDE temperatur og afstand. ────
app.get("/distance", (req, res) => {
  const d = room(req).distance;
  ok(res, { value: d.value, updated: d.updated });
});

app.put("/distance", (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return fail(res, 400, "Feltet 'value' skal være et tal");
  }
  const r = room(req);
  r.distance = { value, updated: new Date().toISOString() };
  ok(res, r.distance, "Afstand opdateret");
});

// ── Ukendt rute ─────────────────────────────────────────────────────────────
app.use((req, res) => fail(res, 404, "Ukendt endpoint"));

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Fysiske Enheder API kører på port ${PORT}`));
