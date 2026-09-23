export const APPLICATION_VERSION = "1.1";

export function getApplicationVersionLabel() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const shortSha = sha?.slice(0, 7);
  return shortSha
    ? `Version ${APPLICATION_VERSION} · ${shortSha}`
    : `Version ${APPLICATION_VERSION}`;
}


export function getDeploymentVersion() {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
}
