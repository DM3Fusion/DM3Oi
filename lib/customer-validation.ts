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

export function validateCustomerCreation(values: CustomerCreationValues) {
  const fieldErrors: Record<string, string> = {};
  const email = values.email.trim().toLowerCase();
  const phone = normalizeCustomerPhone(values.phone);
  const name = deriveCustomerName(values.firstName, values.lastName, values.name);
  Object.assign(fieldErrors, validateOptionalCustomerAddress(values));
  if (values.type !== "INDIVIDUAL" && values.type !== "BUSINESS")
    fieldErrors.type = "Select a valid customer type.";
  if (!name) fieldErrors.name = "Name or structured first/last name is required.";
  if (!customerEmailPattern.test(email))
    fieldErrors.email = "Enter a valid email address.";
  if (!phone) fieldErrors.phone = "Enter a valid U.S. phone number.";
  return Object.keys(fieldErrors).length
    ? {
        ok: false as const,
        error: "Correct the highlighted fields.",
        fieldErrors,
        values,
      }
    : {
        ok: true as const,
        value: {
          type: values.type as "INDIVIDUAL" | "BUSINESS",
          name,
          firstName: values.firstName?.trim() ?? "",
          lastName: values.lastName?.trim() ?? "",
          streetAddress: values.streetAddress?.trim() ?? "",
          city: values.city?.trim() ?? "",
          state: values.state?.trim().toUpperCase() ?? "",
          postalCode: values.postalCode?.trim() ?? "",
          email,
          phone: phone!,
          notes: values.notes.trim(),
        },
      };
}
