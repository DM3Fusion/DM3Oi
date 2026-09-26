export const customerEmailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const customerPhonePattern=/^(?:[0-9]{10}|[0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4}|\+1[ -][0-9]{3}[- ][0-9]{3}[- ][0-9]{4}|\+1[ -]\([0-9]{3}\)[ -][0-9]{3}[- ][0-9]{4})$/;
export const normalizeCustomerPhone=(value:string)=>{const source=value.trim();if(!customerPhonePattern.test(source))return null;const digits=source.replace(/[^0-9]/g,"");return digits.length===10||digits.length===11&&digits.startsWith("1")?digits:null;};

export type CustomerCreationValues = {
  type: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
};

export function validateCustomerCreation(values: CustomerCreationValues) {
  const fieldErrors: Record<string, string> = {};
  const email = values.email.trim().toLowerCase();
  const phone = normalizeCustomerPhone(values.phone);
  if (values.type !== "INDIVIDUAL" && values.type !== "BUSINESS")
    fieldErrors.type = "Select a valid customer type.";
  if (!values.name.trim()) fieldErrors.name = "Name is required.";
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
          name: values.name.trim(),
          email,
          phone: phone!,
          notes: values.notes.trim(),
        },
      };
}
