import { customerEmailPattern, normalizeCustomerPhone } from "./customer-validation.ts";

export const CUSTOMER_IMPORT_HEADERS = [
  "firstName",
  "lastName",
  "StreetAddress",
  "City",
  "State",
  "ZipCode",
  "Email",
  "Phone",
] as const;

export const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);

export type CustomerIdentity = {
  id?: string;
  customer_number?: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export type ImportRow = {
  row_number: number;
  first_name: string;
  last_name: string;
  street_address: string;
  city: string;
  state: string;
  postal_code: string;
  email: string;
  phone: string;
};

export type ImportClassification = "NEW" | "EXACT" | "DUPLICATE" | "INVALID";

export type ImportPreviewRow = ImportRow & {
  name: string;
  classification: ImportClassification;
  reasons: string[];
  matchedCustomerNumbers: string[];
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  summary: {
    total: number;
    validNew: number;
    exactMatches: number;
    duplicateCandidates: number;
    invalid: number;
  };
};

export type DuplicatePair = {
  leftId: string;
  rightId: string;
  reasons: string[];
};

function parseCsvRecords(source: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  const text = source.replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim())) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unterminated quoted field.");
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  return records;
}

export function parseCustomerImportCsv(source: string): ImportRow[] {
  if (!source.trim()) throw new Error("Select a non-empty CSV file.");
  if (new TextEncoder().encode(source).length > 1_000_000)
    throw new Error("The CSV exceeds the 1 MB import limit.");
  const records = parseCsvRecords(source);
  if (!records.length) throw new Error("The CSV is empty.");
  const headers = records[0].map((value) => value.trim());
  if (
    headers.length !== CUSTOMER_IMPORT_HEADERS.length ||
    headers.some((header, index) => header !== CUSTOMER_IMPORT_HEADERS[index])
  ) {
    throw new Error(`CSV headers must be exactly: ${CUSTOMER_IMPORT_HEADERS.join(",")}`);
  }
  if (records.length === 1) throw new Error("The CSV has no customer rows.");
  if (records.length - 1 > 500) throw new Error("A single import is limited to 500 rows.");

  return records.slice(1).map((values, index) => {
    if (values.length !== CUSTOMER_IMPORT_HEADERS.length)
      throw new Error(`CSV row ${index + 2} has ${values.length} columns; expected 8.`);
    const phone = normalizeCustomerPhone(values[7]);
    return {
      row_number: index + 2,
      first_name: values[0].trim(),
      last_name: values[1].trim(),
      street_address: values[2].trim(),
      city: values[3].trim(),
      state: values[4].trim().toUpperCase(),
      postal_code: values[5].trim(),
      email: values[6].trim().toLowerCase(),
      phone: phone ?? values[7].trim(),
    };
  });
}

const normalizedText = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizedPhone = (value: string | null | undefined) =>
  (value ?? "").replace(/[^0-9]/g, "");

export function duplicateSignals(left: CustomerIdentity, right: CustomerIdentity) {
  const signals: string[] = [];
  const leftEmail = left.email?.trim().toLowerCase();
  const rightEmail = right.email?.trim().toLowerCase();
  const leftPhone = normalizedPhone(left.phone);
  const rightPhone = normalizedPhone(right.phone);
  if (leftEmail && rightEmail && leftEmail === rightEmail) signals.push("Exact normalized email");
  if (leftPhone && rightPhone && leftPhone === rightPhone) signals.push("Exact normalized phone");
  if (
    normalizedText(left.first_name) &&
    normalizedText(left.first_name) === normalizedText(right.first_name) &&
    normalizedText(left.last_name) === normalizedText(right.last_name) &&
    normalizedText(left.postal_code) === normalizedText(right.postal_code)
  ) signals.push("First name, last name, and postal code");
  if (
    normalizedText(left.name) &&
    normalizedText(left.name) === normalizedText(right.name) &&
    normalizedText(left.street_address) &&
    normalizedText(left.street_address) === normalizedText(right.street_address)
  ) signals.push("Name and street address");
  return signals;
}

function rowIdentity(row: ImportRow): CustomerIdentity {
  return {
    first_name: row.first_name,
    last_name: row.last_name,
    name: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    street_address: row.street_address,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
  };
}

function validateImportRow(row: ImportRow) {
  const errors: string[] = [];
  if (!row.first_name) errors.push("First name is required.");
  if (!row.last_name) errors.push("Last name is required.");
  if (!row.street_address) errors.push("Street address is required.");
  if (!row.city) errors.push("City is required.");
  if (!US_STATE_CODES.has(row.state)) errors.push("State must be a valid two-letter U.S. code.");
  if (!/^\d{5}(?:-\d{4})?$/.test(row.postal_code)) errors.push("Postal code must be ZIP or ZIP+4.");
  if (!customerEmailPattern.test(row.email)) errors.push("Email is invalid.");
  if (!normalizeCustomerPhone(row.phone)) errors.push("Phone is invalid.");
  return errors;
}

export function previewCustomerImport(rows: ImportRow[], existing: CustomerIdentity[]): ImportPreview {
  const invalidReasons = rows.map(validateImportRow);
  const previewRows = rows.map<ImportPreviewRow>((row, index) => {
    const identity = rowIdentity(row);
    if (invalidReasons[index].length) {
      return { ...row, name: identity.name, classification: "INVALID", reasons: invalidReasons[index], matchedCustomerNumbers: [] };
    }

    const exact = existing.filter((customer) => {
      const signals = duplicateSignals(identity, customer);
      return signals.includes("Exact normalized email") && signals.includes("Exact normalized phone");
    });
    if (exact.length) {
      return {
        ...row,
        name: identity.name,
        classification: "EXACT",
        reasons: ["Email and phone match an existing Customer."],
        matchedCustomerNumbers: exact.flatMap((customer) => customer.customer_number ?? []),
      };
    }

    const existingMatches = existing
      .map((customer) => ({ customer, signals: duplicateSignals(identity, customer) }))
      .filter((match) => match.signals.length);
    const csvMatches = rows
      .map((other, otherIndex) => ({ otherIndex, signals: duplicateSignals(identity, rowIdentity(other)) }))
      .filter((match) => match.otherIndex !== index && !invalidReasons[match.otherIndex].length && match.signals.length);
    if (existingMatches.length || csvMatches.length) {
      return {
        ...row,
        name: identity.name,
        classification: "DUPLICATE",
        reasons: [
          ...new Set([
            ...existingMatches.flatMap((match) => match.signals),
            ...csvMatches.flatMap((match) => match.signals.map((signal) => `${signal} (CSV row ${rows[match.otherIndex].row_number})`)),
          ]),
        ],
        matchedCustomerNumbers: existingMatches.flatMap((match) => match.customer.customer_number ?? []),
      };
    }
    return { ...row, name: identity.name, classification: "NEW", reasons: ["No strong duplicate signal found."], matchedCustomerNumbers: [] };
  });
  return {
    rows: previewRows,
    summary: {
      total: previewRows.length,
      validNew: previewRows.filter((row) => row.classification === "NEW").length,
      exactMatches: previewRows.filter((row) => row.classification === "EXACT").length,
      duplicateCandidates: previewRows.filter((row) => row.classification === "DUPLICATE").length,
      invalid: previewRows.filter((row) => row.classification === "INVALID").length,
    },
  };
}

export function findDuplicateCustomerPairs(customers: Array<CustomerIdentity & { id: string }>): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let left = 0; left < customers.length; left += 1) {
    for (let right = left + 1; right < customers.length; right += 1) {
      const reasons = duplicateSignals(customers[left], customers[right]);
      if (reasons.length) pairs.push({ leftId: customers[left].id, rightId: customers[right].id, reasons });
    }
  }
  return pairs;
}
