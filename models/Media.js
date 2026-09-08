// Media = ét billede eller én video. Selve filen ligger i dit DigitalOcean
// Space; her gemmes kun METADATA (så databasen holdes let og hurtig).

import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    type: { type: String, enum: ["image", "video"], required: true },
    url: { type: String, required: true }, // offentlig URL i dit Space
    key: { type: String, required: true }, // stien i Space'et (bruges til at slette)
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 }, // bytes
    module: { type: String, default: "" }, // hvilket modul mediet hører til
    uploadedBy: { type: String, default: "" }, // fx elevens navn/id
  },
  { timestamps: true } // giver createdAt + updatedAt
);

export const Media = mongoose.model("Media", mediaSchema);
