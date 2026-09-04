# Fysiske Enheder API

Et lille, selvstændigt API til undervisning i fysiske enheder (ESP32 + React).
Både React-apps og ESP32'er taler med **samme offentlige API** — ingen lokale
IP-adresser, ingen CORS på selve enheden, ingen DGS.

**Ingen database:** al tilstand ligger i hukommelsen og nulstilles ved genstart.
Det er bevidst — nemt at forstå, nemt at deploye.

## Kør lokalt
```bash
npm install
npm start
```
Kører på port `3055` (eller `PORT` fra miljøet). Ret evt. port via `PORT`.

## Svarformat
Alle svar har samme form:
```json
{ "status": "ok", "message": "…", "data": { } }
```

## Endpoints

| Metode | Sti | Body | Retning | Bruges til |
|--------|-----|------|---------|-----------|
| GET | `/display` | — | enhed læser | hent tekst til OLED |
| PUT | `/display` | `{ "text": "…" }` | React skriver | sæt tekst |
| GET | `/led` | — | enhed læser | hent farve (`red/yellow/green/off`) |
| PUT | `/led` | `{ "color": "red" }` | React skriver | sæt LED |
| GET | `/button` | — | React læser | hent tryk-tæller |
| POST | `/button/press` | — | enhed skriver | registrér et tryk |
| DELETE | `/button` | — | React | nulstil tæller |
| GET | `/sensor` | — | React læser | hent seneste måling |
| PUT | `/sensor` | `{ "value": 22.4 }` | enhed skriver | send en måling |

## Eksempler
```bash
# Sæt displaytekst (fra React)         →  ESP32 henter den bagefter
curl -X PUT https://<din-url>/display -H "Content-Type: application/json" -d '{"text":"Hej fra React"}'
curl https://<din-url>/display

# Tænd grøn LED (fra React)            →  ESP32 poller /led og tænder
curl -X PUT https://<din-url>/led -H "Content-Type: application/json" -d '{"color":"green"}'

# ESP32 melder et knap-tryk            →  React viser tælleren
curl -X POST https://<din-url>/button/press
curl https://<din-url>/button
```

## Deploy (DigitalOcean m.fl.)
Almindelig Node-app — samme fremgangsmåde som dine andre API'er:
- Build/run-kommando: `npm start`
- Platformen sætter selv `PORT` (koden bruger `process.env.PORT`).
- Ingen miljøvariabler eller database nødvendig.

> Bemærk: fordi tilstanden ligger i hukommelsen, nulstilles værdierne, hvis
> tjenesten genstartes/redeployes. Det er fint til undervisning. Skal en værdi
> (fx displayteksten) overleve genstart, kan man senere lægge en lille database
> på — men det er ikke nødvendigt for forløbet.
