import fs from "node:fs";

const needed = {
  "46205": 4, "46208": 4, "46214": 7, "46216": 7, "46217": 7,
  "46218": 14, "46219": 7, "46220": 7, "46221": 7, "46222": 6,
  "46224": 7, "46225": 3, "46226": 7, "46227": 7, "46228": 7,
  "46229": 7, "46231": 5, "46234": 5, "46235": 5, "46236": 5,
  "46237": 5, "46239": 5, "46240": 6, "46241": 6, "46250": 5,
  "46254": 5, "46256": 5, "46259": 5, "46260": 6, "46268": 6,
  "46278": 5, "46280": 5, "46290": 5, "47711": 1,
};

const base =
  "https://gisdata.in.gov/server/rest/services/Hosted/" +
  "Address_Points_of_Indiana_Current/FeatureServer/0/query";

const normalize = (value) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const csvEscape = (value) => {
  const s = String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
};

const rows = [];

for (const [zip, countNeeded] of Object.entries(needed)) {
  // Deliberately fetch substantially more than required so the next stage
  // can discard existing MTS addresses and Census nonmatches.
  const desired =
    zip === "46290"
      ? 200
      : Math.max(countNeeded * 8, 40);

  const where = [
    `geozip='${zip}'`,
    `valid_geo_address='YES'`,
    `dlgf_prop_class_code LIKE '4%'`,
    `dlgf_prop_class_code NOT IN ('400','401','402','403','409')`,
    `geofulladdress IS NOT NULL`,
    `geocity IS NOT NULL`,
    `geostate='IN'`,
  ].join(" AND ");

  const params = new URLSearchParams({
    where,
    outFields:
      "objectid,geofulladdress,geocity,geostate,geozip," +
      "dlgf_prop_class_code,latitude,longitude",
    returnGeometry: "false",
    orderByFields: "objectid",
    resultRecordCount: String(desired),
    f: "json",
  });

  const response = await fetch(`${base}?${params}`, {
    headers: { "user-agent": "DM3Oi-demo-data-repair/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Indiana GIS HTTP ${response.status} for ZIP ${zip}`);
  }

  const payload = await response.json();

  if (payload.error) {
    throw new Error(
      `Indiana GIS error for ZIP ${zip}: ${JSON.stringify(payload.error)}`
    );
  }

  const seen = new Set();
  let accepted = 0;

  for (const feature of payload.features ?? []) {
    const a = feature.attributes ?? {};

    const street = normalize(a.geofulladdress);
    const city = normalize(a.geocity);
    const state = normalize(a.geostate);
    const postalCode = normalize(a.geozip);

    if (!street || !city || state !== "IN" || postalCode !== zip) continue;

    const key = `${street}\u001f${city}\u001f${state}\u001f${postalCode}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      objectId: a.objectid,
      streetAddress: street,
      city,
      state,
      postalCode,
      propertyClass: normalize(a.dlgf_prop_class_code),
      sourceLatitude: a.latitude,
      sourceLongitude: a.longitude,
      normalizedKey: key,
    });

    accepted += 1;
  }

  if (accepted < countNeeded) {
    throw new Error(
      `FAIL CLOSED: ZIP ${zip} needs ${countNeeded}, but only ${accepted} distinct commercial candidates were returned`
    );
  }

  console.log(
    `${zip}: need ${countNeeded}, collected ${accepted} candidate addresses`
  );
}

const globalKeys = new Set();
for (const row of rows) {
  if (globalKeys.has(row.normalizedKey)) {
    throw new Error(`FAIL CLOSED: duplicate candidate: ${row.normalizedKey}`);
  }
  globalKeys.add(row.normalizedKey);
}

fs.mkdirSync("scripts/generated", { recursive: true });

const csvHeader = [
  "object_id",
  "street_address",
  "city",
  "state",
  "postal_code",
  "property_class",
  "source_latitude",
  "source_longitude",
].join(",");

const csvRows = rows.map((r) =>
  [
    r.objectId,
    r.streetAddress,
    r.city,
    r.state,
    r.postalCode,
    r.propertyClass,
    r.sourceLatitude,
    r.sourceLongitude,
  ].map(csvEscape).join(",")
);

fs.writeFileSync(
  "scripts/generated/mts-business-reach-commercial-candidates.csv",
  [csvHeader, ...csvRows].join("\n") + "\n"
);

fs.writeFileSync(
  "scripts/generated/mts-business-reach-commercial-candidates.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      requiredReplacementCount: Object.values(needed).reduce((a, b) => a + b, 0),
      candidateCount: rows.length,
      needed,
      rows,
    },
    null,
    2
  ) + "\n"
);

console.log("");
console.log(`Required replacements: 198`);
console.log(`Candidate pool: ${rows.length}`);
console.log(
  "CSV: scripts/generated/mts-business-reach-commercial-candidates.csv"
);
console.log(
  "JSON: scripts/generated/mts-business-reach-commercial-candidates.json"
);
