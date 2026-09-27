export const customerEmailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const customerPhonePattern=/^(?:[0-9]{10}|[0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4}|\+1[ -][0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\+1[ -]\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4})$/;
export const normalizeCustomerPhone=(value:string)=>{const source=value.trim();if(!customerPhonePattern.test(source))return null;const digits=source.replace(/[^0-9]/g,"");return digits.length===10||digits.length===11&&digits.startsWith("1")?digits:null;};

export type CustomerCreationValues = {
  type: string;
  name: string;
  firstName?: string;
  lastName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  email: string;
  phone: string;
  notes: string;
};

export type CustomerCreationValidationMode = "COMPLETE_PROFILE" | "GUIDED_INTAKE";

export const deriveCustomerName = (firstName: string | undefined, lastName: string | undefined, fallback: string) =>
  [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || fallback.trim();

export function validateOptionalCustomerAddress(values: Pick<CustomerCreationValues, "state" | "postalCode">) {
  const fieldErrors: Record<string, string> = {};
  const state = values.state?.trim().toUpperCase() ?? "";
  const postalCode = values.postalCode?.trim() ?? "";
  const validStates = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));
  if (state && !validStates.has(state)) fieldErrors.state = "Use a valid two-letter U.S. state code.";
  if (postalCode && !/^\d{5}(?:-\d{4})?$/.test(postalCode))
    fieldErrors.postalCode = "Use ZIP or ZIP+4 format.";
  return fieldErrors;
}

export function validateCustomerCreation(
  values: CustomerCreationValues,
  mode: CustomerCreationValidationMode = "COMPLETE_PROFILE",
) {
  const fieldErrors: Record<string, string> = {};
  const normalizedValues = {
    ...values,
    type: values.type.trim(),
    name: values.name.trim(),
    firstName: values.firstName?.trim() ?? "",
    lastName: values.lastName?.trim() ?? "",
    streetAddress: values.streetAddress?.trim() ?? "",
    city: values.city?.trim() ?? "",
    state: values.state?.trim().toUpperCase() ?? "",
    postalCode: values.postalCode?.trim() ?? "",
    email: values.email.trim().toLowerCase(),
    phone: values.phone.trim(),
    notes: values.notes.trim(),
  };
  const phone = normalizeCustomerPhone(normalizedValues.phone);
  const name = deriveCustomerName(
    normalizedValues.firstName,
    normalizedValues.lastName,
    normalizedValues.name,
  );
  Object.assign(fieldErrors, validateOptionalCustomerAddress(normalizedValues));
  if (normalizedValues.type !== "INDIVIDUAL" && normalizedValues.type !== "BUSINESS")
    fieldErrors.type = "Select a valid customer type.";
  if (mode === "COMPLETE_PROFILE") {
    if (!normalizedValues.firstName) fieldErrors.firstName = "First name is required.";
    if (!normalizedValues.lastName) fieldErrors.lastName = "Last name is required.";
    if (!normalizedValues.streetAddress) fieldErrors.streetAddress = "Street address is required.";
    if (!normalizedValues.city) fieldErrors.city = "City is required.";
    if (!normalizedValues.state) fieldErrors.state = "State is required.";
    if (!normalizedValues.postalCode) fieldErrors.postalCode = "Postal code is required.";
  } else if (!name) {
    fieldErrors.name = "Name or structured first/last name is required.";
  }
  if (!normalizedValues.email)
    fieldErrors.email = "Email is required.";
  else if (!customerEmailPattern.test(normalizedValues.email))
    fieldErrors.email = "Enter a valid email address.";
  if (!normalizedValues.phone)
    fieldErrors.phone = "Phone is required.";
  else if (!phone)
    fieldErrors.phone = "Enter a valid U.S. phone number.";
  return Object.keys(fieldErrors).length
    ? {
        ok: false as const,
        error: "Correct the highlighted fields.",
        fieldErrors,
        values: normalizedValues,
      }
    : {
        ok: true as const,
        value: {
          type: normalizedValues.type as "INDIVIDUAL" | "BUSINESS",
          name,
          firstName: normalizedValues.firstName,
          lastName: normalizedValues.lastName,
          streetAddress: normalizedValues.streetAddress,
          city: normalizedValues.city,
          state: normalizedValues.state,
          postalCode: normalizedValues.postalCode,
          email: normalizedValues.email,
          phone: phone!,
          notes: normalizedValues.notes,
        },
      };
}
