# Fysiske Enheder API — kør det på din egen computer

Dette lille API er "hjernen" mellem din **React-app** og de **fysiske enheder** (LED, display, sensor, knap). Du kører det på din **egen computer**, så du har dit helt eget — ingen andre deler data med dig.

```
   Din React-app  ──►  DIT lokale API  ◄──  (evt.) din ESP32
                       http://localhost:3055
```

---

## 1. Hvad du skal bruge
- **Node.js** (version 18 eller nyere).
  Tjek i en terminal: `node -v`. Får du et versionsnummer, er du klar. Ellers hent på <https://nodejs.org> (vælg "LTS").

## 2. Start API'et (3 trin)
Åbn en terminal i denne mappe og kør:
```bash
npm install
npm start
```
Du skulle nu se: `Fysiske Enheder API kører på port 3055`.

- **Lad terminal-vinduet stå åbent** — lukker du det, stopper API'et.
- **Test i browseren:** åbn <http://localhost:3055/led> → du ser noget JSON (fx `{"status":"ok",...}`). Så virker det!

## 3. Forbind din React-app
I din React-app's `.env`-fil skriver du:
```
VITE_ENHEDER_API=http://localhost:3055
```
Genstart `npm run dev`. Nu rammer din app **dit eget lokale API**. Sæt en LED-farve eller en displaytekst, og hent den igen — det er kun dig, der ændrer den.

---

## 4. (Valgfrit / avanceret) Forbind en ESP32
En ESP32 er **ikke** på din computer, så den kan ikke bruge "localhost". Den skal bruge din computers **IP-adresse** på det lokale WiFi:

1. **Find din computers IP:**
   - Windows: kør `ipconfig` → find **"IPv4-adresse"** (fx `192.168.1.42`).
   - Mac/Linux: kør `ifconfig` eller `ip a`.
2. **I ESP32-sketchen** sætter du adressen til din IP + porten, med **`http`** (ikke `https`) lokalt:
   ```cpp
   const char* API_BASE = "http://192.168.1.42:3055";
   ```
3. **Samme WiFi:** computeren og ESP32'en skal være på **samme 2,4 GHz-netværk**.
4. **Firewall:** første gang du starter API'et, spørger Windows måske, om Node må bruge netværket — sig **ja / Tillad adgang**.

> Bemærk: de udleverede sketches peger som standard på et `https`-sky-API. Til lokal brug skal de bruge `http` + din IP som ovenfor. Spørg din underviser om den lokale sketch-udgave, hvis du vil køre en ESP32 mod dit lokale API.

---

## Endpoints (hvad API'et kan)
Alle svar har formen `{ status, message, data }`.

| Metode | Sti | Body | Bruges til |
|--------|-----|------|-----------|
| GET / PUT | `/display` | `{ "text": "…" }` | tekst til OLED |
| GET / PUT | `/led` | `{ "color": "on\|off\|blink\|red\|yellow\|green" }` | LED-tilstand |
| GET · POST | `/button` · `/button/press` | — | tryk-tæller |
| GET / PUT | `/sensor` | `{ "value": 22.4 }` | en måling |

Eksempel — sæt displaytekst med `curl`:
```bash
curl -X PUT http://localhost:3055/display -H "Content-Type: application/json" -d "{\"text\":\"Hej\"}"
```

---

## Godt at vide
- **Ingen database:** tilstanden ligger i hukommelsen og **nulstilles**, når du stopper eller genstarter API'et. Det er helt fint — start bare forfra.
- **Dit eget API:** fordi det kun kører hos dig, deler du ikke data med klassen — ingen overskriver dine værdier.

## Fejlfinding
- **`port already in use` / 3055 optaget:** noget kører allerede på porten. Luk det, eller vælg en anden port:
  - Windows (PowerShell): `$env:PORT=3060; npm start`
  - Mac/Linux: `PORT=3060 npm start`
  (Husk så at bruge det nye portnummer i `.env` og i browseren.)
- **React kan ikke nå API'et:** kører API-terminalen stadig? Er URL'en `http://localhost:3055` (ikke `https`)?
- **`npm` findes ikke:** Node er ikke installeret — se trin 1.
