import fs from "node:fs";

const INPUT =
  "scripts/generated/mts-business-reach-commercial-candidates.csv";
const OUTPUT =
  "scripts/generated/mts-business-reach-census-validated.csv";
const RAW_OUTPUT =
  "scripts/generated/mts-business-reach-census-raw.csv";

const needed = {
  "46205": 4, "46208": 4, "46214": 7, "46216": 7, "46217": 7,
  "46218": 14, "46219": 7, "46220": 7, "46221": 7, "46222": 6,
  "46224": 7, "46225": 3, "46226": 7, "46227": 7, "46228": 7,
  "46229": 7, "46231": 5, "46234": 5, "46235": 5, "46236": 5,
  "46237": 5, "46239": 5, "46240": 6, "46241": 6, "46250": 5,
  "46254": 5, "46256": 5, "46259": 5, "46260": 6, "46268": 6,
  "46278": 5, "46280": 5, "46290": 5, "47711": 1,
};

const endpoint =
  "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

const csvEscape = (value) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

const inputRows = parseCsv(fs.readFileSync(INPUT, "utf8"));
const header = inputRows.shift();

const index = Object.fromEntries(header.map((name, i) => [name, i]));

const candidates = inputRows
  .filter((r) => r.length >= header.length)
  .map((r, i) => ({
    requestId: String(i + 1),
    objectId: r[index.object_id],
    streetAddress: r[index.street_address],
    city: r[index.city],
    state: r[index.state],
    postalCode: r[index.postal_code],
    propertyClass: r[index.property_class],
    sourceLatitude: r[index.source_latitude],
    sourceLongitude: r[index.source_longitude],
  }));

if (candidates.length < 198) {
  throw new Error(
    `FAIL CLOSED: expected at least 198 candidate rows, found ${candidates.length}`
  );
}

const byRequestId = new Map(
  candidates.map((candidate) => [candidate.requestId, candidate])
);

const validated = [];
const rawResponses = [];

for (let offset = 0; offset < candidates.length; offset += 500) {
  const chunk = candidates.slice(offset, offset + 500);

  const censusCsv = chunk
    .map((c) =>
      [
        c.requestId,
        c.streetAddress,
        c.city,
        c.state,
        c.postalCode,
      ]
        .map(csvEscape)
        .join(",")
    )
    .join("\n");

  const form = new FormData();
  form.set(
    "addressFile",
    new Blob([censusCsv], { type: "text/csv" }),
    "business-reach.csv"
  );
  form.set("benchmark", "Public_AR_Current");

  console.log(
    `Submitting Census batch ${offset + 1}-${offset + chunk.length}...`
  );

  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(
      `Census geocoder returned HTTP ${response.status}`
    );
  }

  const body = await response.text();
  rawResponses.push(body);

  const rows = parseCsv(body);

  if (rows.length !== chunk.length) {
    throw new Error(
      `FAIL CLOSED: Census batch expected ${chunk.length} rows, returned ${rows.length}`
    );
  }

  for (const row of rows) {
    const requestId = row[0];
    const candidate = byRequestId.get(requestId);

    if (!candidate) {
      throw new Error(
        `FAIL CLOSED: Census returned unknown request ID ${requestId}`
      );
    }

    // Census batch format:
    // 0 id
    // 1 original/input address
    // 2 match status
    // 3 match type
    // 4 matched address
    // 5 longitude,latitude
    // 6 TIGER/Line ID
    // 7 side
    const matchStatus = String(row[2] ?? "").trim();
    const matchType = String(row[3] ?? "").trim();
    const matchedAddress = String(row[4] ?? "").trim();
    const coordinates = String(row[5] ?? "").trim();

    if (matchStatus.toUpperCase() !== "MATCH") continue;
    if (matchType.toUpperCase() !== "EXACT") continue;

    const [longitudeText, latitudeText] = coordinates.split(",");
    const longitude = Number(longitudeText);
    const latitude = Number(latitudeText);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }

    validated.push({
      ...candidate,
      matchStatus,
      matchType,
      matchedAddress,
      latitude,
      longitude,
    });
  }
}

fs.writeFileSync(
  RAW_OUTPUT,
  rawResponses.join("\n")
);

const outputHeader = [
  "request_id",
  "object_id",
  "street_address",
  "city",
  "state",
  "postal_code",
  "property_class",
  "census_match_type",
  "census_matched_address",
  "latitude",
  "longitude",
];

const outputRows = validated.map((r) =>
  [
    r.requestId,
    r.objectId,
    r.streetAddress,
    r.city,
    r.state,
    r.postalCode,
    r.propertyClass,
    r.matchType,
    r.matchedAddress,
    r.latitude,
    r.longitude,
  ]
    .map(csvEscape)
    .join(",")
);

fs.writeFileSync(
  OUTPUT,
  [outputHeader.join(","), ...outputRows].join("\n") + "\n"
);

// ------------------------------------------------------------
// Validation by ZIP.
// We care about distinct Census coordinates as well as distinct
// source addresses so Business Reach does not collapse customers.
// ------------------------------------------------------------

const perZip = new Map();

for (const zip of Object.keys(needed)) {
  perZip.set(zip, {
    rows: [],
    addressKeys: new Set(),
    coordinateKeys: new Set(),
  });
}

for (const row of validated) {
  const bucket = perZip.get(row.postalCode);
  if (!bucket) continue;

  const addressKey = [
    row.streetAddress.trim().toUpperCase(),
    row.city.trim().toUpperCase(),
    row.state.trim().toUpperCase(),
    row.postalCode.trim(),
  ].join("\u001f");

  // Six decimals is substantially tighter than street-level display needs
  // while avoiding string-format differences in equivalent numeric values.
  const coordinateKey =
    `${row.latitude.toFixed(6)},${row.longitude.toFixed(6)}`;

  bucket.rows.push(row);
  bucket.addressKeys.add(addressKey);
  bucket.coordinateKeys.add(coordinateKey);
}

console.log("");
console.log(
  `${"ZIP".padEnd(8)}${"NEEDED".padStart(8)}` +
  `${"EXACT".padStart(9)}${"UNIQUE ADDR".padStart(14)}` +
  `${"UNIQUE GEO".padStart(13)}${"STATUS".padStart(10)}`
);
console.log("-".repeat(62));

let allCovered = true;

for (const [zip, countNeeded] of Object.entries(needed)) {
  const bucket = perZip.get(zip);
  const exact = bucket.rows.length;
  const uniqueAddresses = bucket.addressKeys.size;
  const uniqueCoordinates = bucket.coordinateKeys.size;

  const ok =
    uniqueAddresses >= countNeeded &&
    uniqueCoordinates >= countNeeded;

  allCovered = allCovered && ok;

  console.log(
    `${zip.padEnd(8)}` +
    `${String(countNeeded).padStart(8)}` +
    `${String(exact).padStart(9)}` +
    `${String(uniqueAddresses).padStart(14)}` +
    `${String(uniqueCoordinates).padStart(13)}` +
    `${(ok ? "OK" : "SHORT").padStart(10)}`
  );
}

console.log("-".repeat(62));
console.log(`INPUT CANDIDATES: ${candidates.length}`);
console.log(`CENSUS EXACT MATCHES: ${validated.length}`);
console.log(`REPLACEMENTS NEEDED: 198`);
console.log(`ALL ZIPs COVERED: ${allCovered ? "YES" : "NO"}`);
console.log(`VALIDATED CSV: ${OUTPUT}`);

if (!allCovered) {
  process.exitCode = 1;
}
