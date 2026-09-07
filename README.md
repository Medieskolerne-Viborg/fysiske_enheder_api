# Fysiske Enheder API

Et lille, selvstændigt API til undervisning i fysiske enheder (ESP32 + React).
Både React-apps og ESP32'er taler med **samme offentlige API** — ingen DGS.

**Ingen database:** al tilstand ligger i hukommelsen og nulstilles ved genstart.

## Elev-id ("rum") — så en hel klasse kan arbejde samtidig
API'et gemmer tilstand **pr. id**. Hver elev sender sit eget id med i URL'en:
```
GET /led?id=anne        PUT /display?id=anne
```
Så har hver elev sit eget rum og overskriver ikke de andre. Uden `?id=` bruges rummet **`demo`**. Eleven bruger **samme id** i sin React-app (`VITE_DEVICE_ID`) og på sin ESP32 (`DEVICE_ID`), så app og enhed hører sammen.

## Kør lokalt (til test/udvikling)
```bash
npm install
npm start
```
Kører på port `3055` (eller `PORT` fra miljøet).

## Deploy (DigitalOcean m.fl.)
- Run-kommando: `npm start`
- Platformen sætter selv `PORT` (koden bruger `process.env.PORT`).
- Ingen miljøvariabler eller database.
- **Vigtigt:** kør på **én instans** (tilstanden er i hukommelsen — flere instanser ville ikke dele den).

## Endpoints
Alle svar: `{ status, message, data }`. Tilføj `?id=<navn>` til alle kald.

| Metode | Sti | Body | Retning |
|--------|-----|------|---------|
| GET / PUT | `/display` | `{ "text": "…" }` | React → enhed |
| GET / PUT | `/led` | `{ "color": "on\|off\|blink\|red\|yellow\|green" }` | React → enhed |
| GET · POST · DELETE | `/button` · `/button/press` · `/button` | — | enhed → React |
| GET / PUT | `/sensor` | `{ "value": 22.4 }` | enhed → React (fx temperatur) |
| GET / PUT | `/distance` | `{ "value": 42.5 }` | enhed → React (fx afstand i cm) |

## Eksempler
```bash
curl -X PUT "https://<url>/led?id=anne" -H "Content-Type: application/json" -d "{\"color\":\"green\"}"
curl "https://<url>/led?id=anne"
```
