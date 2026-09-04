// ─────────────────────────────────────────────────────────────────────────
//  Fysiske Enheder — API til undervisning (ESP32 + React)
//
//  Ét fælles, offentligt API som både React-apps OG ESP32'er taler med.
//  Ingen database: al tilstand ligger i hukommelsen (nulstilles ved genstart).
//  Det er helt bevidst — så er den nem at forstå og nem at deploye.
//
//  Svarformat overalt:  { status: "ok" | "error", message, data }
// ─────────────────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors()); // React (browser) må kalde API'et. ESP32 er ligeglad med CORS.

const PORT = process.env.PORT || 3055;

// ── Tilstanden (én simpel "hukommelse" for enhederne) ──────────────────────
const state = {
  display: { text: "Hej fra skyen" },              // tekst til OLED
  led: { color: "off" },                           // rød | gul | grøn | off
  button: { count: 0, lastPressed: null },         // fysisk knap → tæller
  sensor: { value: null, updated: null },          // en måling fra en enhed
};

// Farver til trafiklys-LED'er + on/blink til den indbyggede LED (GPIO2).
const LED_COLORS = ["red", "yellow", "green", "off", "on", "blink"];

// Lille hjælper, så alle svar ser ens ud.
const ok = (res, data, message = "ok") =>
  res.status(200).send({ status: "ok", message, data });
const fail = (res, code, message) =>
  res.status(code).send({ status: "error", message, data: {} });

// ── Forside / health ───────────────────────────────────────────────────────
app.get("/", (req, res) => {
  ok(res, {
    endpoints: [
      "GET  /display", "PUT  /display   { text }",
      "GET  /led", "PUT  /led       { color }",
      "GET  /button", "POST /button/press",
      "GET  /sensor", "PUT  /sensor    { value }",
    ],
  }, "Fysiske Enheder API kører");
});

// ── DISPLAY (tekst til OLED) — React skriver, ESP32 læser ───────────────────
app.get("/display", (req, res) => ok(res, { text: state.display.text }));

app.put("/display", (req, res) => {
  const { text } = req.body;
  if (typeof text !== "string" || text.trim() === "") {
    return fail(res, 400, "Feltet 'text' skal være en tekst");
  }
  state.display.text = text.trim();
  ok(res, { text: state.display.text }, "Display opdateret");
});

// ── LED (farve) — React sætter, ESP32 læser og tænder ───────────────────────
app.get("/led", (req, res) => ok(res, { color: state.led.color }));

app.put("/led", (req, res) => {
  const { color } = req.body;
  if (!LED_COLORS.includes(color)) {
    return fail(res, 400, `'color' skal være en af: ${LED_COLORS.join(", ")}`);
  }
  state.led.color = color;
  ok(res, { color: state.led.color }, "LED opdateret");
});

// ── KNAP (input) — ESP32 melder tryk, React læser tælleren ──────────────────
app.get("/button", (req, res) =>
  ok(res, { count: state.button.count, lastPressed: state.button.lastPressed }));

app.post("/button/press", (req, res) => {
  state.button.count += 1;
  state.button.lastPressed = new Date().toISOString();
  ok(res, { count: state.button.count, lastPressed: state.button.lastPressed }, "Tryk registreret");
});

// Nulstil tælleren (fx fra React).
app.delete("/button", (req, res) => {
  state.button = { count: 0, lastPressed: null };
  ok(res, state.button, "Tæller nulstillet");
});

// ── SENSOR (input) — ESP32 sender en måling, React læser den ────────────────
app.get("/sensor", (req, res) =>
  ok(res, { value: state.sensor.value, updated: state.sensor.updated }));

app.put("/sensor", (req, res) => {
  const { value } = req.body;
  if (typeof value !== "number") {
    return fail(res, 400, "Feltet 'value' skal være et tal");
  }
  state.sensor = { value, updated: new Date().toISOString() };
  ok(res, state.sensor, "Sensor opdateret");
});

// ── Ukendt rute ─────────────────────────────────────────────────────────────
app.use((req, res) => fail(res, 404, "Ukendt endpoint"));

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Fysiske Enheder API kører på port ${PORT}`));
