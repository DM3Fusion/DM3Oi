import type {
  BusinessReachAddressGroup,
  BusinessReachGeocodeResult,
} from "./business-reach.ts";
import { isValidBusinessReachCoordinate } from "./business-reach.ts";

const csvField = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function buildCensusAddressBatch(groups: BusinessReachAddressGroup[]) {
  const keyByRequestId = new Map<string, string>();
  const csv = groups.map((group, index) => {
    const requestId = String(index + 1);
    keyByRequestId.set(requestId, group.key);
    return [
      requestId,
      group.address.streetAddress,
      group.address.city,
      group.address.state,
      group.address.postalCode,
    ].map(csvField).join(",");
  }).join("\n");
  return { csv: csv ? `${csv}\n` : "", keyByRequestId };
}

export function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

export function parseCensusAddressBatch(
  response: string,
  keyByRequestId: ReadonlyMap<string, string>,
) {
  const processedKeys = new Set<string>();
  const results = new Map<string, BusinessReachGeocodeResult>();
  for (const row of parseCsvRows(response)) {
    const key = keyByRequestId.get(row[0] ?? "");
    if (!key) continue;
    processedKeys.add(key);
    if (row[2] !== "Match") continue;
    const [longitude, latitude] = (row[5] ?? "").split(",").map(Number);
    if (isValidBusinessReachCoordinate(latitude, longitude)) {
      results.set(key, { latitude, longitude });
    }
  }
  return { processedKeys, results };
}
