// Fil-lagring i et DigitalOcean Space (S3-kompatibelt) via AWS S3-SDK'et.
// Nøgler og adresser kommer fra miljøvariabler (aldrig i koden/git):
//   SPACES_ENDPOINT   fx https://fra1.digitaloceanspaces.com
//   SPACES_REGION     fx fra1
//   SPACES_BUCKET     navnet på dit space
//   SPACES_KEY        access key
//   SPACES_SECRET     secret key
//   SPACES_PUBLIC_BASE (valgfri) CDN-base, fx https://<bucket>.fra1.cdn.digitaloceanspaces.com

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const rawEndpoint = process.env.SPACES_ENDPOINT;
const region = process.env.SPACES_REGION || "us-east-1";
const bucket = process.env.SPACES_BUCKET;
const accessKeyId = process.env.SPACES_KEY;
const secretAccessKey = process.env.SPACES_SECRET;
const publicBase = process.env.SPACES_PUBLIC_BASE;

// Endpoint skal være REGIONENS endpoint UDEN bucket, fx https://ams3.digitaloceanspaces.com.
// Sætter man ved en fejl hele Space-URL'en (med bucket foran), fjerner vi bucket-delen,
// så adressen ikke bliver til bucket.bucket.region... (som også bryder TLS-certifikatet).
const endpoint =
  rawEndpoint && bucket
    ? rawEndpoint.replace(new RegExp(`^(https?://)${bucket}\\.`, "i"), "$1")
    : rawEndpoint;

// true når alt er sat op, så upload-endpointet kan slås til/fra.
export const storageReady = () =>
  Boolean(endpoint && bucket && accessKeyId && secretAccessKey);

const client = storageReady()
  ? new S3Client({
      endpoint,
      region,
      forcePathStyle: false,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

// Byg den offentlige URL til en fil.
function publicUrl(objectKey) {
  if (publicBase) return `${publicBase.replace(/\/+$/, "")}/${objectKey}`;
  const host = endpoint.replace(/^https?:\/\//, "");
  return `https://${bucket}.${host}/${objectKey}`;
}

// Læg en fil (buffer) i Space'et og få den offentlige URL retur.
export async function uploadFile(buffer, objectKey, contentType) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read", // så filen kan vises på infoskærmen
    })
  );
  return publicUrl(objectKey);
}

// Slet en fil fra Space'et.
export async function deleteFile(objectKey) {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}
