# Fysiske Enheder API

Et lille, selvstændigt API til undervisning i fysiske enheder (ESP32 + React).
Både React-apps og ESP32'er taler med **samme offentlige API** — ingen DGS.

**Enheds-tilstand uden database:** led, display, sensor osv. ligger i
hukommelsen og nulstilles ved genstart. **Media (billeder/videoer)** gemmes
derimod varigt: selve filerne i et DigitalOcean Space og metadata i MongoDB
(se afsnittet [Media](#media-billedervideoer) og [Miljøvariabler](#miljøvariabler)).

## Elev-id ("rum") — så en hel klasse kan arbejde samtidig
API'et gemmer tilstand **pr. id**. Hver elev sender sit eget id med i URL'en:
```
GET /led?id=2       PUT /display?id=2
```
Så har hver elev sit eget rum og overskriver ikke de andre. Uden `?id=` bruges rummet **`demo`**. Eleven bruger **samme id** i sin React-app (`VITE_DEVICE_ID`) og på sin ESP32 (`DEVICE_ID`), så app og enhed hører sammen.

## Kør lokalt (til test/udvikling)
```bash
npm install
npm start
```
Kører på port `3055` (eller `PORT` fra miljøet).

## Miljøvariabler
Enheds-delen kører helt uden variabler. Media-delen kræver database + Space —
sættes som miljøvariabler (aldrig i koden/git). Mangler de, er media-endpoints
bare slået fra, mens resten kører.

| Variabel | Til | Eksempel |
| -------- | --- | -------- |
| `MONGODB_URI` | MongoDB-forbindelse | `mongodb+srv://…` |
| `SPACES_ENDPOINT` | Space-endpoint | `https://fra1.digitaloceanspaces.com` |
| `SPACES_REGION` | Space-region | `fra1` |
| `SPACES_BUCKET` | Navn på dit space | `mcdm-media` |
| `SPACES_KEY` | Access key | `…` |
| `SPACES_SECRET` | Secret key | `…` |
| `SPACES_PUBLIC_BASE` | (valgfri) CDN-base | `https://mcdm-media.fra1.cdn.digitaloceanspaces.com` |
| `UPLOAD_TOKEN` | (valgfri) beskytter upload/slet | et hemmeligt ord |

## Deploy (DigitalOcean m.fl.)
- Run-kommando: `npm start`
- Platformen sætter selv `PORT` (koden bruger `process.env.PORT`).
- Sæt miljøvariablerne ovenfor (scope: **Run time**).
- **Vigtigt:** kør på **én instans** (enheds-tilstanden er i hukommelsen — flere instanser ville ikke dele den).

## Endpoints
Alle svar: `{ status, message, data }`. Tilføj `?id=<navn>` til alle kald.

| Metode | Sti | Body | Retning |
|--------|-----|------|---------|
| GET / PUT | `/display` | `{ "text": "…" }` | React → enhed |
| GET / PUT | `/led` | `{ "color": "on\|off\|blink\|red\|yellow\|green" }` | React → enhed |
| GET · POST · DELETE | `/button` · `/button/press` · `/button` | — | enhed → React |
| GET / PUT | `/sensor` | `{ "value": 22.4 }` | enhed → React (fx temperatur) |
| GET / PUT | `/distance` | `{ "value": 42.5 }` | enhed → React (fx afstand i cm) |
| GET | `/schedule` | — | reference → React/enhed (liste over hold) |
| GET | `/schedule/:hold` | — | reference → React/enhed (holdets skema) |
| GET | `/schedule/:hold/today` | — | reference → React/enhed (dagens fag) |
| GET | `/educations` | — | reference → React/enhed (skolens uddannelser) |
| GET | `/educations/:slug` | — | reference → React/enhed (fag + varighed) |
| GET | `/departures` | — | Rejseplanen-proxy → React/enhed (bus/tog) |
| GET | `/media` | — | liste over billeder/videoer (`?type=`, `?module=`) |
| GET | `/media/:id` | — | ét media |
| POST | `/media` | form-data: `file` | upload billede/video (+ `title`, `module`, `uploadedBy`) |
| DELETE | `/media/:id` | — | slet media (også filen i Space'et) |

### Uddannelser (`/educations`)
Skolens uddannelser med **fag** og **varighed** (faste data, kilde: mcdm.dk).

- `GET /educations` returnerer en kort liste (`slug`, `name`, `duration`).
- `GET /educations/:slug` returnerer én uddannelse med `subjects` (fag) og
  varighed. Slugs: `webudvikler`, `fotograf`, `filmproduktion` (store/små
  bogstaver er ligegyldigt).

### Afgange (`/departures`)
Proxy til **Rejseplanens API 2.0** (bus- og togafgange). Serveren kalder
Rejseplanen, så nøglen holdes hemmelig og browseren slipper for CORS.

- Kræver en gratis nøgle fra [labs.rejseplanen.dk](https://labs.rejseplanen.dk),
  sat som miljøvariabel **`REJSEPLANEN_KEY`** (aldrig i koden/git). Mangler den,
  svarer endpointet `501` med en hjælpetekst.
- `GET /departures` bruger standard-stoppet **Skaldehøjvej**. Vælg et andet med
  `?stop=<navn>` og antal med `?max=6`.
- Svaret er en renset liste: `{ line, direction, time, planned, delayed, track }`.
- Resultatet caches i 30 sek. for at skåne Rejseplanens rate limit.

### Media (billeder/videoer)
Eleverne kan lægge billeder og videoer op til infoskærmen. Selve filen lægges i
et **DigitalOcean Space**, og **metadata** (URL, type, størrelse, modul, hvem)
gemmes i **MongoDB**. Kræver `MONGODB_URI` + `SPACES_*` (se Miljøvariabler).

- `POST /media` — send som `multipart/form-data` med filfeltet **`file`**
  (kun `image/*` og `video/*`, op til 200 MB). Valgfrit: `title`, `module`,
  `uploadedBy`. Svarer med det gemte media (inkl. offentlig `url`).
- `GET /media` — liste (nyeste først). Filtrér med `?type=image|video` og/eller
  `?module=<navn>`.
- `GET /media/:id` — ét media. `DELETE /media/:id` — sletter både metadata og fil.
- Sæt evt. `UPLOAD_TOKEN`; så kræver `POST`/`DELETE` headeren
  `x-upload-token: <token>` (så ikke hvem som helst kan uploade offentligt).

```bash
# Upload et billede
curl -X POST "https://<url>/media" \
  -F "file=@billede.jpg" -F "title=Forsidebillede" -F "module=galleri"
```

### Skema (`/schedule`)
Skemaerne ligger fast i koden og er **fælles** for alle — `?id=` bruges ikke
her. Der er ét skema **pr. hold**, så man kan lave en skærm til hvert hold.
Bruges fx til at få klasselokalets display til at vise dagens fag.

- `GET /schedule` returnerer listen over hold, fx
  `["WebH125-2", "WebH126-1", "WebGF22602"]`.
- `GET /schedule/:hold` returnerer holdets skema som en liste af uger.
- `GET /schedule/:hold/today` returnerer den uge, dagens dato falder i. Feltet
  `text` er en færdig, kort tekst klar til displayet, og `type` er enten
  `"class"` (undervisning) eller `"holiday"` (ferie). Tilføj `?date=YYYY-MM-DD`
  for at teste en anden dag. Weekender og uger uden for skemaet giver
  `text: "Ingen undervisning i dag"`. Holdnavnet er ligeglad med store/små
  bogstaver.

## Eksempler
```bash
curl -X PUT "https://<url>/led?id=2" -H "Content-Type: application/json" -d "{\"color\":\"green\"}"
curl "https://<url>/led?id=2"

# Dagens fag til klasselokalets display
curl "https://<url>/schedule/WebH126-1/today"
curl "https://<url>/schedule/WebH125-2/today?date=2026-09-21"
```
