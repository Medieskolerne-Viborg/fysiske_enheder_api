// ─────────────────────────────────────────────────────────────────────────
//  Fysiske Enheder — API til undervisning (ESP32 + React)
//
//  Ét fælles, offentligt API som både React-apps OG ESP32'er taler med.
//  Ingen database: al tilstand ligger i hukommelsen (nulstilles ved genstart).
//
//  ELEV-ID ("rum"): hver elev bruger sit eget id via ?id=<id> i URL'en,
//  så ingen overskriver hinanden. Uden id bruges rummet "demo".
//    fx:  GET /led?id=id    PUT /display?id=id
//
//  Svarformat overalt:  { status: "ok" | "error", message, data }
// ─────────────────────────────────────────────────────────────────────────

import "./env.js"; // SKAL være først: loader .env(.local) før storage.js/db.js
import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import { connectDb, dbReady } from "./db.js";
import { Media } from "./models/Media.js";
import { uploadFile, deleteFile, storageReady } from "./storage.js";

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
    {
      week: 32,
      monday: "2026-08-03",
      friday: "2026-08-07",
      type: "class",
      code: "16842",
      subject: "Dataservices og -integration (REACT 2.0)",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 33,
      monday: "2026-08-10",
      friday: "2026-08-14",
      type: "class",
      code: "16842",
      subject: "Dataservices og -integration (REACT 2.0)",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 34,
      monday: "2026-08-17",
      friday: "2026-08-21",
      type: "class",
      code: "16851",
      subject: "Serverside programmering (REACT 3.0)",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 35,
      monday: "2026-08-24",
      friday: "2026-08-28",
      type: "class",
      code: "16851",
      subject: "Serverside programmering (REACT 3.0)",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 36,
      monday: "2026-08-31",
      friday: "2026-09-04",
      type: "class",
      code: "16845",
      subject: "Jobsøgning og branchekendskab (Afslutning)",
      teacher: "PM",
      room: "127",
    },
    {
      week: 37,
      monday: "2026-09-07",
      friday: "2026-09-11",
      type: "class",
      code: null,
      subject: "Fysiske enheder",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 38,
      monday: "2026-09-14",
      friday: "2026-09-18",
      type: "class",
      code: null,
      subject: "Fysiske enheder",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 39,
      monday: "2026-09-21",
      friday: "2026-09-25",
      type: "class",
      code: "16850",
      subject: "Eksamensforberedelse",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 40,
      monday: "2026-09-28",
      friday: "2026-10-02",
      type: "class",
      code: null,
      subject: "Eksamensforberedelse",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 41,
      monday: "2026-10-05",
      friday: "2026-10-09",
      type: "class",
      code: null,
      subject: "Eksamensforberedelse",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 42,
      monday: "2026-10-12",
      friday: "2026-10-16",
      type: "holiday",
      code: null,
      subject: "Efterårsferie",
      teacher: null,
      room: null,
    },
    {
      week: 43,
      monday: "2026-10-19",
      friday: "2026-10-23",
      type: "class",
      code: null,
      subject: "Eksamensforberedelse",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 44,
      monday: "2026-10-26",
      friday: "2026-10-30",
      type: "class",
      code: "16847",
      subject: "Eksamen (Projekt)",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 45,
      monday: "2026-11-02",
      friday: "2026-11-06",
      type: "class",
      code: "16847",
      subject: "Eksamen",
      teacher: "ALM",
      room: "127",
    },
    {
      week: 52,
      monday: "2026-12-21",
      friday: "2026-12-25",
      type: "holiday",
      code: null,
      subject: "Juleferie",
      teacher: null,
      room: null,
    },
    {
      week: 53,
      monday: "2026-12-28",
      friday: "2027-01-01",
      type: "holiday",
      code: null,
      subject: "Nytår",
      teacher: null,
      room: null,
    },
  ],
  "WebH126-1": [
    {
      week: 32,
      monday: "2026-08-03",
      friday: "2026-08-07",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 33,
      monday: "2026-08-10",
      friday: "2026-08-14",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "JRN",
      room: "202",
    },
    {
      week: 34,
      monday: "2026-08-17",
      friday: "2026-08-21",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 35,
      monday: "2026-08-24",
      friday: "2026-08-28",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 36,
      monday: "2026-08-31",
      friday: "2026-09-04",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 37,
      monday: "2026-09-07",
      friday: "2026-09-11",
      type: "class",
      code: null,
      subject: "Praktisk webudvikling 1.0",
      teacher: "Lærer+",
      room: "202",
    },
    {
      week: 38,
      monday: "2026-09-14",
      friday: "2026-09-18",
      type: "class",
      code: null,
      subject: "Praktisk webudvikling 1.0",
      teacher: "Lærer+",
      room: "202",
    },
    {
      week: 39,
      monday: "2026-09-21",
      friday: "2026-09-25",
      type: "class",
      code: "16842",
      subject: "Dataservices og -integration (REACT 2.0)",
      teacher: "SFJ",
      room: "202",
    },
    {
      week: 40,
      monday: "2026-09-28",
      friday: "2026-10-02",
      type: "class",
      code: "16842",
      subject: "Dataservices og -integration (REACT 2.0)",
      teacher: "SFJ",
      room: "202",
    },
    {
      week: 41,
      monday: "2026-10-05",
      friday: "2026-10-09",
      type: "class",
      code: "16842",
      subject: "Dataservices og -integration (REACT 2.0)",
      teacher: "SFJ",
      room: "202",
    },
    {
      week: 42,
      monday: "2026-10-12",
      friday: "2026-10-16",
      type: "holiday",
      code: null,
      subject: "Efterårsferie",
      teacher: null,
      room: null,
    },
    {
      week: 43,
      monday: "2026-10-19",
      friday: "2026-10-23",
      type: "class",
      code: "16842",
      subject: "Dataservices og -integration (REACT 2.0)",
      teacher: "SFJ",
      room: "202",
    },
    {
      week: 44,
      monday: "2026-10-26",
      friday: "2026-10-30",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 2.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 45,
      monday: "2026-11-02",
      friday: "2026-11-06",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 2.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 46,
      monday: "2026-11-09",
      friday: "2026-11-13",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 2.0",
      teacher: "PM",
      room: "202",
    },
    {
      week: 47,
      monday: "2026-11-16",
      friday: "2026-11-20",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 2.0",
      teacher: "JM",
      room: "202",
    },
    {
      week: 48,
      monday: "2026-11-23",
      friday: "2026-11-27",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 2.0",
      teacher: "JM",
      room: "202",
    },
    {
      week: 49,
      monday: "2026-11-30",
      friday: "2026-12-04",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 2.0",
      teacher: "JM",
      room: "202",
    },
    {
      week: 50,
      monday: "2026-12-07",
      friday: "2026-12-11",
      type: "class",
      code: "16851",
      subject: "Serverside programmering (REACT 3.0)",
      teacher: "ALM",
      room: "202",
    },
    {
      week: 51,
      monday: "2026-12-14",
      friday: "2026-12-18",
      type: "class",
      code: "16851",
      subject: "Serverside programmering (REACT 3.0)",
      teacher: "ALM",
      room: "202",
    },
    {
      week: 52,
      monday: "2026-12-21",
      friday: "2026-12-25",
      type: "holiday",
      code: null,
      subject: "Juleferie",
      teacher: null,
      room: null,
    },
    {
      week: 53,
      monday: "2026-12-28",
      friday: "2027-01-01",
      type: "holiday",
      code: null,
      subject: "Nytår",
      teacher: null,
      room: null,
    },
  ],
  "WebGF22602": [
    {
      week: 33,
      monday: "2026-08-10",
      friday: "2026-08-14",
      type: "class",
      code: null,
      subject: "Intro til uddannelsen",
      teacher: "PM, JM",
      room: null,
    },
    {
      week: 34,
      monday: "2026-08-17",
      friday: "2026-08-21",
      type: "class",
      code: null,
      subject: "HTML & CSS 1.0 (intro)",
      teacher: "JM",
      room: "220",
    },
    {
      week: 35,
      monday: "2026-08-24",
      friday: "2026-08-28",
      type: "class",
      code: null,
      subject: "HTML & CSS 1.0 (intro)",
      teacher: "JM",
      room: "220",
    },
    {
      week: 36,
      monday: "2026-08-31",
      friday: "2026-09-04",
      type: "class",
      code: null,
      subject: "HTML & CSS 1.0 (intro)",
      teacher: "JM",
      room: "220",
    },
    {
      week: 37,
      monday: "2026-09-07",
      friday: "2026-09-11",
      type: "class",
      code: null,
      subject: "HTML & CSS 1.0 (intro)",
      teacher: "JM",
      room: "220",
    },
    {
      week: 38,
      monday: "2026-09-14",
      friday: "2026-09-18",
      type: "class",
      code: null,
      subject: "Billedebehandling (Photoshop)",
      teacher: "PM",
      room: "220",
    },
    {
      week: 39,
      monday: "2026-09-21",
      friday: "2026-09-25",
      type: "class",
      code: null,
      subject: "HTML & CSS (Projekt) 1.0",
      teacher: "JM",
      room: "220",
    },
    {
      week: 40,
      monday: "2026-09-28",
      friday: "2026-10-02",
      type: "class",
      code: null,
      subject: "HTML & CSS (Projekt) 1.0",
      teacher: "JM",
      room: "220",
    },
    {
      week: 41,
      monday: "2026-10-05",
      friday: "2026-10-09",
      type: "class",
      code: null,
      subject: "Javascript 1.0",
      teacher: "JM",
      room: "220",
    },
    {
      week: 42,
      monday: "2026-10-12",
      friday: "2026-10-16",
      type: "holiday",
      code: null,
      subject: "Efterårsferie",
      teacher: null,
      room: null,
    },
    {
      week: 43,
      monday: "2026-10-19",
      friday: "2026-10-23",
      type: "class",
      code: null,
      subject: "Javascript 1.0",
      teacher: "JM",
      room: "220",
    },
    {
      week: 44,
      monday: "2026-10-26",
      friday: "2026-10-30",
      type: "class",
      code: null,
      subject: "Javascript 1.0",
      teacher: "JM",
      room: "220",
    },
    {
      week: 45,
      monday: "2026-11-02",
      friday: "2026-11-06",
      type: "class",
      code: null,
      subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)",
      teacher: "JRN",
      room: "220",
    },
    {
      week: 46,
      monday: "2026-11-09",
      friday: "2026-11-13",
      type: "class",
      code: null,
      subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)",
      teacher: "JRN",
      room: "220",
    },
    {
      week: 47,
      monday: "2026-11-16",
      friday: "2026-11-20",
      type: "class",
      code: null,
      subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)",
      teacher: "JRN",
      room: "220",
    },
    {
      week: 48,
      monday: "2026-11-23",
      friday: "2026-11-27",
      type: "class",
      code: null,
      subject: "HTML & CSS 2.0 (Css-Grid) (C.R.A.P)",
      teacher: "JRN",
      room: "220",
    },
    {
      week: 49,
      monday: "2026-11-30",
      friday: "2026-12-04",
      type: "class",
      code: null,
      subject: "Praxis (Projekt)",
      teacher: "PM",
      room: "220",
    },
    {
      week: 50,
      monday: "2026-12-07",
      friday: "2026-12-11",
      type: "class",
      code: null,
      subject: "Praxis (Projekt)",
      teacher: "PM",
      room: "220",
    },
    {
      week: 51,
      monday: "2026-12-14",
      friday: "2026-12-18",
      type: "class",
      code: null,
      subject: "Praxis (Projekt)",
      teacher: "PM",
      room: "220",
    },
    {
      week: 52,
      monday: "2026-12-21",
      friday: "2026-12-25",
      type: "holiday",
      code: null,
      subject: "Juleferie",
      teacher: null,
      room: null,
    },
    {
      week: 53,
      monday: "2026-12-28",
      friday: "2027-01-01",
      type: "holiday",
      code: null,
      subject: "Nytår",
      teacher: null,
      room: null,
    },
  ],
  "WebH126-2": [
    {
      week: 32,
      monday: "2026-08-03",
      friday: "2026-08-07",
      type: "class",
      code: "16747",
      subject: "Programmering (Javascript 2.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 33,
      monday: "2026-08-10",
      friday: "2026-08-14",
      type: "class",
      code: "16747",
      subject: "Programmering (Javascript 2.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 34,
      monday: "2026-08-17",
      friday: "2026-08-21",
      type: "class",
      code: "16747",
      subject: "Programmering (Javascript 2.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 35,
      monday: "2026-08-24",
      friday: "2026-08-28",
      type: "class",
      code: "16747",
      subject: "Programmering (Javascript 2.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 36,
      monday: "2026-08-31",
      friday: "2026-09-04",
      type: "class",
      code: "16747",
      subject: "Programmering (Javascript 2.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 37,
      monday: "2026-09-07",
      friday: "2026-09-11",
      type: "class",
      code: null,
      subject: null,
      teacher: "Lærer+",
      room: "203",
    },
    {
      week: 38,
      monday: "2026-09-14",
      friday: "2026-09-18",
      type: "class",
      code: null,
      subject: null,
      teacher: "Lærer+",
      room: "203",
    },
    {
      week: 39,
      monday: "2026-09-21",
      friday: "2026-09-25",
      type: "class",
      code: null,
      subject: "Digital Handel + CMS",
      teacher: "JRN",
      room: "203",
    },
    {
      week: 40,
      monday: "2026-09-28",
      friday: "2026-10-02",
      type: "class",
      code: null,
      subject: "Digital Handel + CMS",
      teacher: "JRN",
      room: "203",
    },
    {
      week: 41,
      monday: "2026-10-05",
      friday: "2026-10-09",
      type: "class",
      code: null,
      subject: "Digital Handel + CMS",
      teacher: "JRN",
      room: "203",
    },
    {
      week: 42,
      monday: "2026-10-12",
      friday: "2026-10-16",
      type: "holiday",
      code: null,
      subject: "Efterårsferie",
      teacher: null,
      room: null,
    },
    {
      week: 43,
      monday: "2026-10-19",
      friday: "2026-10-23",
      type: "class",
      code: null,
      subject: "Digital Handel + CMS",
      teacher: "JRN",
      room: "203",
    },
    {
      week: 44,
      monday: "2026-10-26",
      friday: "2026-10-30",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "203",
    },
    {
      week: 45,
      monday: "2026-11-02",
      friday: "2026-11-06",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "203",
    },
    {
      week: 46,
      monday: "2026-11-09",
      friday: "2026-11-13",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "PM",
      room: "203",
    },
    {
      week: 47,
      monday: "2026-11-16",
      friday: "2026-11-20",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "JM",
      room: "203",
    },
    {
      week: 48,
      monday: "2026-11-23",
      friday: "2026-11-27",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "JM",
      room: "203",
    },
    {
      week: 49,
      monday: "2026-11-30",
      friday: "2026-12-04",
      type: "class",
      code: "16846",
      subject: "Praktisk webudvikling 1.0",
      teacher: "JM",
      room: "203",
    },
    {
      week: 50,
      monday: "2026-12-07",
      friday: "2026-12-11",
      type: "class",
      code: "16758",
      subject: "Avanceret frontend (REACT 1.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 51,
      monday: "2026-12-14",
      friday: "2026-12-18",
      type: "class",
      code: "16758",
      subject: "Avanceret frontend (REACT 1.0)",
      teacher: "SFJ",
      room: "203",
    },
    {
      week: 52,
      monday: "2026-12-21",
      friday: "2026-12-25",
      type: "holiday",
      code: null,
      subject: "Juleferie",
      teacher: null,
      room: null,
    },
    {
      week: 53,
      monday: "2026-12-28",
      friday: "2027-01-01",
      type: "holiday",
      code: null,
      subject: "Nytår",
      teacher: null,
      room: null,
    },
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
    hint: "Brug ?id=<dit-id> så du har dit eget rum, fx /led?id=2",
    rooms: rooms.size,
    endpoints: [
      "GET  /display", "PUT  /display   { text }",
      "GET  /led", "PUT  /led       { color }",
      "GET  /button", "POST /button/press",
      "GET  /sensor", "PUT  /sensor    { value }",
      "GET  /distance", "PUT  /distance { value }",
      "GET  /schedule  (liste over hold)",
      "GET  /schedule/:hold", "GET  /schedule/:hold/today  (?date=YYYY-MM-DD)",
      "GET  /educations", "GET  /educations/:slug",
      "GET  /departures  (?stop=...&max=6)",
      "GET  /media", "GET  /media/:id",
      "POST /media  (form-data: file)", "DELETE /media/:id",
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

// ── UDDANNELSER (fælles reference-data) ─────────────────────────────────────
//  Skolens uddannelser med fag og varighed. Faste data (ikke pr. ?id=),
//  kilde: mediacollege.dk / mcdm.dk. Grundforløbet (GF2) er 20 uger; det
//  efterfølgende hovedforløb veksler mellem skole og praktik.
const EDUCATIONS = {
  webudvikler: {
    slug: "webudvikler",
    name: "Webudvikler",
    grundforlobWeeks: 20,
    duration: "Grundforløb (GF2): 20 uger. Herefter hovedforløb med praktik.",
    subjects: [
      "HTML, CSS og JavaScript",
      "Figma",
      "Photoshop",
      "Illustrator",
      "Planlægning og design af websites",
      "Webudvikling (hovedforløb: React og server-side)",
    ],
    link: "https://mcdm.dk/webudvikler/grundforlob/",
  },
  fotograf: {
    slug: "fotograf",
    name: "Fotograf",
    grundforlobWeeks: 20,
    duration: "Grundforløb (GF2): 20 uger. Herefter hovedforløb med praktik.",
    subjects: [
      "Fotografering i atelier og on location",
      "Billedbehandling, print, efterbearbejdning og udstilling",
      "Billedets historie og perceptionslære",
      "Førstehjælp og brand (obligatorisk)",
    ],
    link: "https://mcdm.dk/fotograf/grundforlob-fotograf/",
  },
  filmproduktion: {
    slug: "filmproduktion",
    name: "Filmproduktion (Film & TV)",
    grundforlobWeeks: 20,
    duration: "Grundforløb (GF2): 20 uger. Herefter hovedforløb med praktik.",
    subjects: [
      "Storyboarding og tilrettelæggelse",
      "Teknik og belysning",
      "Billed- og lydoptagelse",
      "Redigering og præsentation",
      "Billedbehandling",
      "Kommunikation",
      "Informationsteknologi",
    ],
    link: "https://mcdm.dk/film-og-tv-produktionstekniker/grundforlob-film-tv/",
  },
};

// Slå en uddannelse op (uafhængigt af store/små bogstaver).
function findEducation(slug) {
  const key = Object.keys(EDUCATIONS).find(
    (k) => k.toLowerCase() === String(slug || "").toLowerCase()
  );
  return key ? EDUCATIONS[key] : null;
}

// Liste over uddannelser (kort udgave).
app.get("/educations", (req, res) => {
  const list = Object.values(EDUCATIONS).map(({ slug, name, duration }) => ({
    slug,
    name,
    duration,
  }));
  ok(res, { educations: list });
});

// Én uddannelse med fag og varighed.
app.get("/educations/:slug", (req, res) => {
  const edu = findEducation(req.params.slug);
  if (!edu) {
    return fail(res, 404, `Ukendt uddannelse. Vælg en af: ${Object.keys(EDUCATIONS).join(", ")}`);
  }
  ok(res, edu);
});

// ── AFGANGE (Rejseplanen-proxy) ─────────────────────────────────────────────
//  Rejseplanens API 2.0 kræver en nøgle (accessId) og kan ikke kaldes direkte
//  fra en browser (CORS). Derfor kalder SERVEREN Rejseplanen her, holder nøglen
//  hemmelig, og giver et rent /departures-endpoint videre til React/ESP32.
//
//  Nøgle: hentes gratis på https://labs.rejseplanen.dk og sættes som
//  miljøvariabel  REJSEPLANEN_KEY  (aldrig i koden/git).
//
//  Kald:  GET /departures            (standard: Skaldehøjvej, Viborg)
//         GET /departures?stop=...&max=6
const RP_BASE = "https://www.rejseplanen.dk/api";
const RP_KEY = process.env.REJSEPLANEN_KEY;
const DEFAULT_STOP = "Skaldehøjvej";

// Små caches: stop-id slås kun op sjældent, og afgange højst hvert 30. sek.
const stopIdCache = new Map();      // stopnavn -> location-id
const departuresCache = new Map();  // stopnavn -> { at, data }
const DEPARTURES_TTL = 30 * 1000;

// "14:05:00" -> "14:05"
const hhmm = (t) => (typeof t === "string" ? t.slice(0, 5) : t);

// Slå et stoppested op og gem dets id (så vi ikke gør det ved hvert kald).
async function resolveStopId(stop) {
  if (stopIdCache.has(stop)) return stopIdCache.get(stop);
  const url = `${RP_BASE}/location.name?accessId=${RP_KEY}&input=${encodeURIComponent(stop)}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Rejseplanen location ${res.status}`);
  const json = await res.json();
  const list = json.stopLocationOrCoordLocation || [];
  const first = list.map((x) => x.StopLocation).find(Boolean);
  if (!first) throw new Error(`Fandt ikke stoppestedet "${stop}"`);
  stopIdCache.set(stop, first.id);
  return first.id;
}

app.get("/departures", async (req, res) => {
  if (!RP_KEY) {
    return fail(res, 501, "REJSEPLANEN_KEY mangler på serveren (hent en nøgle på labs.rejseplanen.dk)");
  }
  const stop = String(req.query.stop || DEFAULT_STOP).slice(0, 60);
  const max = Math.min(Math.max(parseInt(req.query.max, 10) || 6, 1), 20);

  // Servér fra cache, hvis den er frisk (skåner Rejseplanens rate limit).
  const cached = departuresCache.get(stop);
  if (cached && Date.now() - cached.at < DEPARTURES_TTL) {
    return ok(res, cached.data, "Afgange (cache)");
  }

  try {
    const id = await resolveStopId(stop);
    const url = `${RP_BASE}/departureBoard?accessId=${RP_KEY}&id=${encodeURIComponent(id)}&maxJourneys=${max}&format=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Rejseplanen departureBoard ${r.status}`);
    const json = await r.json();

    // Ryd op i svaret: kun det displayet skal bruge.
    const departures = (json.Departure || []).slice(0, max).map((d) => ({
      line: (d.name || "").trim(),                 // fx "Bus 3A"
      direction: d.direction || "",                // hvor bussen kører hen
      time: hhmm(d.rtTime || d.time),              // realtid hvis muligt
      planned: hhmm(d.time),                       // planlagt tid
      delayed: Boolean(d.rtTime && d.rtTime !== d.time),
      track: d.rtTrack || d.track || "",
    }));

    const data = { stop, departures };
    departuresCache.set(stop, { at: Date.now(), data });
    ok(res, data, "Afgange");
  } catch (err) {
    fail(res, 502, `Kunne ikke hente afgange: ${err.message}`);
  }
});

// ── MEDIA (billeder/videoer) — MongoDB + DigitalOcean Space ─────────────────
//  Selve filen lægges i Space'et; metadata gemmes i MongoDB.
//  Kræver MONGODB_URI + SPACES_* som miljøvariabler (se README).

// Tager imod filen i hukommelsen, så vi kan sende den videre til Space'et.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB (rummer også korte videoer)
  fileFilter: (req, file, cb) => {
    const okType =
      file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/");
    cb(okType ? null : new Error("Kun billeder og videoer er tilladt"), okType);
  },
});

// Slår media-endpoints fra, hvis databasen ikke er sat op.
const requireDb = (req, res, next) =>
  dbReady() ? next() : fail(res, 501, "Database ikke konfigureret (sæt MONGODB_URI)");

// Simpel beskyttelse af upload/slet: er UPLOAD_TOKEN sat, kræves samme token i
// headeren x-upload-token. Er den ikke sat, er det åbent (kun til udvikling).
const requireUploadToken = (req, res, next) => {
  const token = process.env.UPLOAD_TOKEN;
  if (!token) return next();
  if (req.get("x-upload-token") === token) return next();
  return fail(res, 401, "Manglende eller forkert x-upload-token");
};

// Liste over media (nyeste først). Filtrér med ?type=image|video&module=...
app.get("/media", requireDb, async (req, res) => {
  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.module) filter.module = req.query.module;
  const media = await Media.find(filter).sort({ createdAt: -1 }).limit(100);
  ok(res, { media });
});

// Ét media.
app.get("/media/:id", requireDb, async (req, res) => {
  try {
    const item = await Media.findById(req.params.id);
    if (!item) return fail(res, 404, "Media ikke fundet");
    ok(res, item);
  } catch {
    fail(res, 400, "Ugyldigt id");
  }
});

// Upload: send som multipart/form-data med filfeltet "file" (+ evt. title,
// module, uploadedBy). Filen lægges i Space'et, metadata gemmes i MongoDB.
app.post("/media", requireUploadToken, requireDb, upload.single("file"), async (req, res) => {
  if (!storageReady()) return fail(res, 501, "Space ikke konfigureret (sæt SPACES_*)");
  if (!req.file) return fail(res, 400, "Ingen fil - send den som form-data feltet 'file'");
  try {
    const isVideo = req.file.mimetype.startsWith("video/");
    const ext = (req.file.originalname.split(".").pop() || "").toLowerCase();
    // Alle filer lægges i mcd_viborg-mappen i Space'et (kan ændres med SPACES_FOLDER).
    const folder = (process.env.SPACES_FOLDER || "mcd_viborg").replace(/^\/+|\/+$/g, "");
    const objectKey = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext ? "." + ext : ""}`;

    const url = await uploadFile(req.file.buffer, objectKey, req.file.mimetype);

    const doc = await Media.create({
      title: req.body.title || req.file.originalname,
      type: isVideo ? "video" : "image",
      url,
      key: objectKey,
      mimeType: req.file.mimetype,
      size: req.file.size,
      module: req.body.module || "",
      uploadedBy: req.body.uploadedBy || "",
    });
    ok(res, doc, "Uploadet");
  } catch (err) {
    fail(res, 502, `Upload fejlede: ${err.message}`);
  }
});

// Slet media (både metadata i DB og filen i Space'et).
app.delete("/media/:id", requireUploadToken, requireDb, async (req, res) => {
  try {
    const item = await Media.findById(req.params.id);
    if (!item) return fail(res, 404, "Media ikke fundet");
    if (storageReady()) await deleteFile(item.key);
    await item.deleteOne();
    ok(res, { id: item._id }, "Slettet");
  } catch (err) {
    fail(res, 400, `Kunne ikke slette: ${err.message}`);
  }
});

// ── Ukendt rute ─────────────────────────────────────────────────────────────
app.use((req, res) => fail(res, 404, "Ukendt endpoint"));

// Fejl-håndtering (fx multer: fil for stor / forkert type) → pænt JSON-svar.
app.use((err, req, res, _next) => {
  fail(res, 400, err.message || "Der skete en fejl");
});

// Forbind til databasen (hvis MONGODB_URI er sat) og start serveren.
connectDb();

app.listen(PORT, "0.0.0.0", () =>
  console.log(`Fysiske Enheder API kører på port ${PORT}`));
