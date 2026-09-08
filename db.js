// Databaseforbindelse (MongoDB via Mongoose).
// DB'en bruges KUN til media (billeder/videoer). Enheds-tilstanden (led,
// display, sensor osv.) ligger stadig i hukommelsen. Mangler MONGODB_URI,
// kører resten af API'et videre - media-endpoints slås bare fra.

import mongoose from "mongoose";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("MONGODB_URI mangler → media-endpoints er slået fra (resten kører).");
    return false;
  }
  try {
    await mongoose.connect(uri);
    console.log("MongoDB forbundet");
    return true;
  } catch (err) {
    console.error("MongoDB-forbindelse fejlede:", err.message);
    return false;
  }
}

// true når forbindelsen er klar (bruges til at slå media-endpoints til/fra).
export const dbReady = () => mongoose.connection.readyState === 1;
