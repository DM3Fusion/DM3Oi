export function buildInvitationVerificationUrl(input: {
  redirectUrl: string;
  hashedToken: string;
  verificationType: string;
}) {
  if (
    !["invite", "magiclink"].includes(input.verificationType) ||
    !input.hashedToken.trim()
  )
    throw new Error("INVITATION_LINK_INVALID");

  const url = new URL(input.redirectUrl);
  url.searchParams.set("token_hash", input.hashedToken);
  url.searchParams.set("type", input.verificationType);
  return url.toString();
}
