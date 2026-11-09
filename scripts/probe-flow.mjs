// End-to-end probe against the deployed service: consent -> photo -> questionnaire.
// Reads a real photo from .probe/reference.jpg when PROBE_PHOTO is set.
import { readFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const BASE = process.env.AI_CITY_BASE ?? "https://ai-city-web-391632496355.asia-northeast1.run.app";

function crcTable() {
  return Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
}
const TABLE = crcTable();
function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
function syntheticPng(size = 64) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      row[1 + x * 3] = (x * 4) % 256;
      row[2 + x * 3] = (y * 4) % 256;
      row[3 + x * 3] = 180;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Minimal cookie jar: the service issues a signed aicity_sid cookie.
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function absorb(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = cookieHeader();
  const response = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  absorb(response);
  return response;
}

const step = (n, msg) => console.log(`[${n}] ${msg}`);

// 1. Consent with the photo permission.
step(1, "POST /api/session (terms + photo + public)");
const session = await call("/api/session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ terms: true, photo: true, public: true }),
});
console.log(`    status=${session.status} body=${await session.text()}`);
if (!session.ok) throw new Error("session failed");

const check = await call("/api/session");
console.log(`    GET /api/session -> ${check.status} ${await check.text()}`);

// 2. Upload the photo.
step(2, `POST /api/photo (${process.env.PROBE_PHOTO ?? "default reference"})`);
const photoPath = process.env.PROBE_PHOTO ?? ".probe/reference.jpg";
const photoBytes = await readFile(photoPath);
const mime = photoPath.endsWith(".png") ? "image/png" : "image/jpeg";
const form = new FormData();
form.set("photo", new Blob([photoBytes], { type: mime }), photoPath.split(/[/\\]/).pop());
const photo = await call("/api/photo", { method: "POST", body: form });
console.log(`    status=${photo.status} body=${await photo.text()} bytes=${photoBytes.length}`);
if (!photo.ok) throw new Error("photo upload failed");

// 3. Questionnaire -> resident + QUEUED job.
step(3, "POST /api/join (nickname + six answers)");
const join = await call("/api/join", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    nickname: "プローブ",
    answers: [0, 0, 0, 0, 0, 0],
    color: "violet",
    mark: "star",
  }),
});
const joinBody = await join.text();
console.log(`    status=${join.status} body=${joinBody}`);
if (!join.ok) throw new Error("join failed");
const { residentId } = JSON.parse(joinBody);
console.log(`    residentId=${residentId}`);

step("OK", `queued resident ${residentId}; run the local worker next`);
console.log(`RESIDENT_ID=${residentId}`);
