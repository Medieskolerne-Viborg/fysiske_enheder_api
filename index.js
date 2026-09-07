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

// ── SKEMAER (fælles reference-data) ─────────────────────────────────────────
//  Skemaerne ligger FAST i koden og er FÆLLES for alle (ikke pr. ?id=), fordi
//  det er de samme fag for hele holdet. Der er ét skema pr. HOLD, så eleverne
//  kan lave en skærm til hvert hold. Hvert fag/ferie varer typisk en hel uge
//  (mandag–fredag). Datoer er ISO-format "YYYY-MM-DD", så de er nemme at
//  sammenligne. type: "class" = undervisning, "holiday" = ferie.
//  Et display poller bare GET /schedule/<hold>/today.
const SCHEDULES = {
  "WebH125-2": [
    { week: 32, monday: "2026-08-03", friday: "2026-08-07", type: "class", code: "16842", subject: "Dataservices og -integration (REACT 2.0)", teacher: "ALM", room: "127" },
    { week: 33, monday: "2026-08-10", friday: "2026-08-14", type: "class", code: "16842", subject: "Dataservices og -integration (REACT 2.0)", teacher: "ALM", room: "127" },
    { week: 34, monday: "2026-08-17", friday: "2026-08-21", type: "class", code: "16851", subject: "Serverside programmering (REACT 3.0)", teacher: "ALM", room: "127" },
    { week: 35, monday: "2026-08-24", friday: "2026-08-28", type: "class", code: "16851", subject: "Serverside programmering (REACT 3.0)", teacher: "ALM", room: "127" },
    { week: 36, monday: "2026-08-31", friday: "2026-09-04", type: "class", code: "16845", subject: "Jobsøgning og branchekendskab (Afslutning)", teacher: "PM", room: "127" },
    { week: 37, monday: "2026-09-07", friday: "2026-09-11", type: "class", code: null, subject: null, teacher: "SFJ", room: "127" },
    { week: 38, monday: "2026-09-14", friday: "2026-09-18", type: "class", code: null, subject: null, teacher: "SFJ", room: "127" },
    { week: 39, monday: "2026-09-21", friday: "2026-09-25", type: "class", code: "16850", subject: "Programmering og styring af fysiske enheder", teacher: "ALM", room: "127" },
    { week: 40, monday: "2026-09-28", friday: "2026-10-02", type: "class", code: null, subject: "Eksamensforberedelse", teacher: "ALM", room: "127" },
    { week: 41, monday: "2026-10-05", friday: "2026-10-09", type: "class", code: null, subject: "Eksamensforberedelse", teacher: "ALM", room: "127" },
    { week: 42, monday: "2026-10-12", friday: "2026-10-16", type: "holiday", code: null, subject: "Efterårsferie", teacher: null, room: null },
    { week: 43, monday: "2026-10-19", friday: "2026-10-23", type: "class", code: null, subject: "Eksamensforberedelse", teacher: "ALM", room: "127" },
    { week: 44, monday: "2026-10-26", friday: "2026-10-30", type: "class", code: "16847", subject: "Eksamen (Projekt)", teacher: "ALM", room: "127" },
    { week: 45, monday: "2026-11-02", friday: "2026-11-06", type: "class", code: "16847", subject: "Eksamen", teacher: "ALM", room: "127" },
    { week: 52, monday: "2026-12-21", friday: "2026-12-25", type: "holiday", code: null, subject: "Juleferie", teacher: null, room: null },
    { week: 53, monday: "2026-12-28", friday: "2027-01-01", type: "holiday", code: null, subject: "Nytår", teacher: null, room: null },
  ],
  "WebH126-1": [
    { week: 32, monday: "2026-08-03", friday: "2026-08-07", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "202" },
    { week: 33, monday: "2026-08-10", friday: "2026-08-14", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "JRN", room: "202" },
    { week: 34, monday: "2026-08-17", friday: "2026-08-21", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "202" },
    { week: 35, monday: "2026-08-24", friday: "2026-08-28", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "202" },
    { week: 36, monday: "2026-08-31", friday: "2026-09-04", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "202" },
    { week: 37, monday: "2026-09-07", friday: "2026-09-11", type: "class", code: null, subject: null, teacher: "Lærer+", room: "202" },
    { week: 38, monday: "2026-09-14", friday: "2026-09-18", type: "class", code: null, subject: null, teacher: "Lærer+", room: "202" },
    { week: 39, monday: "2026-09-21", friday: "2026-09-25", type: "class", code: "16842", subject: "Dataservices og -integration (REACT 2.0)", teacher: "SFJ", room: "202" },
    { week: 40, monday: "2026-09-28", friday: "2026-10-02", type: "class", code: "16842", subject: "Dataservices og -integration (REACT 2.0)", teacher: "SFJ", room: "202" },
    { week: 41, monday: "2026-10-05", friday: "2026-10-09", type: "class", code: "16842", subject: "Dataservices og -integration (REACT 2.0)", teacher: "SFJ", room: "202" },
    { week: 42, monday: "2026-10-12", friday: "2026-10-16", type: "holiday", code: null, subject: "Efterårsferie", teacher: null, room: null },
    { week: 43, monday: "2026-10-19", friday: "2026-10-23", type: "class", code: "16842", subject: "Dataservices og -integration (REACT 2.0)", teacher: "SFJ", room: "202" },
    { week: 44, monday: "2026-10-26", friday: "2026-10-30", type: "class", code: "16846", subject: "Praktisk webudvikling 2.0", teacher: "PM", room: "202" },
    { week: 45, monday: "2026-11-02", friday: "2026-11-06", type: "class", code: "16846", subject: "Praktisk webudvikling 2.0", teacher: "PM", room: "202" },
    { week: 46, monday: "2026-11-09", friday: "2026-11-13", type: "class", code: "16846", subject: "Praktisk webudvikling 2.0", teacher: "PM", room: "202" },
    { week: 47, monday: "2026-11-16", friday: "2026-11-20", type: "class", code: "16846", subject: "Praktisk webudvikling 2.0", teacher: "JM", room: "202" },
    { week: 48, monday: "2026-11-23", friday: "2026-11-27", type: "class", code: "16846", subject: "Praktisk webudvikling 2.0", teacher: "JM", room: "202" },
    { week: 49, monday: "2026-11-30", friday: "2026-12-04", type: "class", code: "16846", subject: "Praktisk webudvikling 2.0", teacher: "JM", room: "202" },
    { week: 50, monday: "2026-12-07", friday: "2026-12-11", type: "class", code: "16851", subject: "Serverside programmering (REACT 3.0)", teacher: "ALM", room: "202" },
    { week: 51, monday: "2026-12-14", friday: "2026-12-18", type: "class", code: "16851", subject: "Serverside programmering (REACT 3.0)", teacher: "ALM", room: "202" },
    { week: 52, monday: "2026-12-21", friday: "2026-12-25", type: "holiday", code: null, subject: "Juleferie", teacher: null, room: null },
    { week: 53, monday: "2026-12-28", friday: "2027-01-01", type: "holiday", code: null, subject: "Nytår", teacher: null, room: null },
  ],
  "WebGF22602": [
    { week: 33, monday: "2026-08-10", friday: "2026-08-14", type: "class", code: null, subject: "Intro til uddannelsen", teacher: "PM, JM", room: null },
    { week: 34, monday: "2026-08-17", friday: "2026-08-21", type: "class", code: null, subject: "HTML & CSS 1.0 (intro)", teacher: "JM", room: "220" },
    { week: 35, monday: "2026-08-24", friday: "2026-08-28", type: "class", code: null, subject: "HTML & CSS 1.0 (intro)", teacher: "JM", room: "220" },
    { week: 36, monday: "2026-08-31", friday: "2026-09-04", type: "class", code: null, subject: "HTML & CSS 1.0 (intro)", teacher: "JM", room: "220" },
    { week: 37, monday: "2026-09-07", friday: "2026-09-11", type: "class", code: null, subject: "HTML & CSS 1.0 (intro)", teacher: "JM", room: "220" },
    { week: 38, monday: "2026-09-14", friday: "2026-09-18", type: "class", code: null, subject: "Billedebehandling (Photoshop)", teacher: "PM", room: "220" },
    { week: 39, monday: "2026-09-21", friday: "2026-09-25", type: "class", code: null, subject: "HTML & CSS (Projekt) 1.0", teacher: "JM", room: "220" },
    { week: 40, monday: "2026-09-28", friday: "2026-10-02", type: "class", code: null, subject: "HTML & CSS (Projekt) 1.0", teacher: "JM", room: "220" },
    { week: 41, monday: "2026-10-05", friday: "2026-10-09", type: "class", code: null, subject: "Javascript 1.0", teacher: "JM", room: "220" },
    { week: 42, monday: "2026-10-12", friday: "2026-10-16", type: "holiday", code: null, subject: "Efterårsferie", teacher: null, room: null },
    { week: 43, monday: "2026-10-19", friday: "2026-10-23", type: "class", code: null, subject: "Javascript 1.0", teacher: "JM", room: "220" },
    { week: 44, monday: "2026-10-26", friday: "2026-10-30", type: "class", code: null, subject: "Javascript 1.0", teacher: "JM", room: "220" },
    { week: 45, monday: "2026-11-02", friday: "2026-11-06", type: "class", code: null, subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)", teacher: "JRN", room: "220" },
    { week: 46, monday: "2026-11-09", friday: "2026-11-13", type: "class", code: null, subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)", teacher: "JRN", room: "220" },
    { week: 47, monday: "2026-11-16", friday: "2026-11-20", type: "class", code: null, subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)", teacher: "JRN", room: "220" },
    { week: 48, monday: "2026-11-23", friday: "2026-11-27", type: "class", code: null, subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)", teacher: "JRN", room: "220" },
    { week: 49, monday: "2026-11-30", friday: "2026-12-04", type: "class", code: null, subject: "Praxis (Projekt)", teacher: "PM", room: "220" },
    { week: 50, monday: "2026-12-07", friday: "2026-12-11", type: "class", code: null, subject: "Praxis (Projekt)", teacher: "PM", room: "220" },
    { week: 51, monday: "2026-12-14", friday: "2026-12-18", type: "class", code: null, subject: "Praxis (Projekt)", teacher: "PM", room: "220" },
    { week: 52, monday: "2026-12-21", friday: "2026-12-25", type: "holiday", code: null, subject: "Juleferie", teacher: null, room: null },
    { week: 53, monday: "2026-12-28", friday: "2027-01-01", type: "holiday", code: null, subject: "Nytår", teacher: null, room: null },
  ],
  "WebH126-2": [
    { week: 32, monday: "2026-08-03", friday: "2026-08-07", type: "class", code: "16747", subject: "Programmering (Javascript 2.0)", teacher: "SFJ", room: "203" },
    { week: 33, monday: "2026-08-10", friday: "2026-08-14", type: "class", code: "16747", subject: "Programmering (Javascript 2.0)", teacher: "SFJ", room: "203" },
    { week: 34, monday: "2026-08-17", friday: "2026-08-21", type: "class", code: "16747", subject: "Programmering (Javascript 2.0)", teacher: "SFJ", room: "203" },
    { week: 35, monday: "2026-08-24", friday: "2026-08-28", type: "class", code: "16747", subject: "Programmering (Javascript 2.0)", teacher: "SFJ", room: "203" },
    { week: 36, monday: "2026-08-31", friday: "2026-09-04", type: "class", code: "16747", subject: "Programmering (Javascript 2.0)", teacher: "SFJ", room: "203" },
    { week: 37, monday: "2026-09-07", friday: "2026-09-11", type: "class", code: null, subject: null, teacher: "Lærer+", room: "203" },
    { week: 38, monday: "2026-09-14", friday: "2026-09-18", type: "class", code: null, subject: null, teacher: "Lærer+", room: "203" },
    { week: 39, monday: "2026-09-21", friday: "2026-09-25", type: "class", code: null, subject: "Digital Handel + CMS", teacher: "JRN", room: "203" },
    { week: 40, monday: "2026-09-28", friday: "2026-10-02", type: "class", code: null, subject: "Digital Handel + CMS", teacher: "JRN", room: "203" },
    { week: 41, monday: "2026-10-05", friday: "2026-10-09", type: "class", code: null, subject: "Digital Handel + CMS", teacher: "JRN", room: "203" },
    { week: 42, monday: "2026-10-12", friday: "2026-10-16", type: "holiday", code: null, subject: "Efterårsferie", teacher: null, room: null },
    { week: 43, monday: "2026-10-19", friday: "2026-10-23", type: "class", code: null, subject: "Digital Handel + CMS", teacher: "JRN", room: "203" },
    { week: 44, monday: "2026-10-26", friday: "2026-10-30", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "203" },
    { week: 45, monday: "2026-11-02", friday: "2026-11-06", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "203" },
    { week: 46, monday: "2026-11-09", friday: "2026-11-13", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "PM", room: "203" },
    { week: 47, monday: "2026-11-16", friday: "2026-11-20", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "JM", room: "203" },
    { week: 48, monday: "2026-11-23", friday: "2026-11-27", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "JM", room: "203" },
    { week: 49, monday: "2026-11-30", friday: "2026-12-04", type: "class", code: "16846", subject: "Praktisk webudvikling 1.0", teacher: "JM", room: "203" },
    { week: 50, monday: "2026-12-07", friday: "2026-12-11", type: "class", code: "16758", subject: "Avanceret frontend (REACT 1.0)", teacher: "SFJ", room: "203" },
    { week: 51, monday: "2026-12-14", friday: "2026-12-18", type: "class", code: "16758", subject: "Avanceret frontend (REACT 1.0)", teacher: "SFJ", room: "203" },
    { week: 52, monday: "2026-12-21", friday: "2026-12-25", type: "holiday", code: null, subject: "Juleferie", teacher: null, room: null },
    { week: 53, monday: "2026-12-28", friday: "2027-01-01", type: "holiday", code: null, subject: "Nytår", teacher: null, room: null },
  ],
};

// Dagens dato som "YYYY-MM-DD" i lokal tid. Kan overstyres med ?date= til test.
function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Slå et hold op (uafhængigt af store/små bogstaver). Returnerer null hvis
// holdet ikke findes.
function findHold(name) {
  const key = Object.keys(SCHEDULES).find(
    (k) => k.toLowerCase() === String(name || "").toLowerCase()
  );
  return key ? { hold: key, schedule: SCHEDULES[key] } : null;
}

// Find den uge, en given dato falder i (mandag–fredag inkl.). Weekender og
// uger uden for skemaet giver null.
function weekForDate(schedule, dateStr) {
  return schedule.find((e) => dateStr >= e.monday && dateStr <= e.friday) || null;
}

// Kort tekst til displayet ud fra en skema-række.
function scheduleText(entry) {
  if (!entry) return "Ingen undervisning i dag";
  if (entry.subject) return entry.code ? `${entry.code} ${entry.subject}` : entry.subject;
  if (entry.teacher) return `Undervisning (${entry.teacher})`;
  return "Ingen undervisning";
}

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
      "GET  /schedule  (liste over hold)",
      "GET  /schedule/:hold", "GET  /schedule/:hold/today  (?date=YYYY-MM-DD)",
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

// ── SKEMA — display/React læser, hvilket fag et hold har ────────────────────
//    Fælles data (ikke pr. ?id=). Kun læsning (GET).

// Liste over hold, man kan lave en skærm til.
app.get("/schedule", (req, res) => ok(res, { holds: Object.keys(SCHEDULES) }));

// Dagens fag for ét hold. ?date=YYYY-MM-DD kan bruges til at teste andre dage.
app.get("/schedule/:hold/today", (req, res) => {
  const found = findHold(req.params.hold);
  if (!found) {
    return fail(res, 404, `Ukendt hold. Vælg et af: ${Object.keys(SCHEDULES).join(", ")}`);
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || ""))
    ? req.query.date
    : isoDate();
  const entry = weekForDate(found.schedule, date);
  ok(res, { hold: found.hold, date, text: scheduleText(entry), ...(entry || {}) }, "Dagens fag");
});

// Hele skemaet for ét hold.
app.get("/schedule/:hold", (req, res) => {
  const found = findHold(req.params.hold);
  if (!found) {
    return fail(res, 404, `Ukendt hold. Vælg et af: ${Object.keys(SCHEDULES).join(", ")}`);
  }
  ok(res, { hold: found.hold, schedule: found.schedule });
});

// ── Ukendt rute ─────────────────────────────────────────────────────────────
app.use((req, res) => fail(res, 404, "Ukendt endpoint"));

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Fysiske Enheder API kører på port ${PORT}`));
