// Loader miljøvariabler fra en lokal fil, så vi kan teste på egen maskine.
// Rækkefølge: .env.local vinder over .env. På DigitalOcean findes ingen af
// filerne - der kommer variablerne fra platformen, og dette gør så ingenting.
//
// VIGTIGT: importér denne fil FØRST i index.js (før storage.js/db.js), så
// variablerne er sat, inden de moduler læser process.env.
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"] });
