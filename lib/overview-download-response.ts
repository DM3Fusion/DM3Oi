type OverviewDownloadDependencies = {
  readFile: () => Promise<Buffer>;
  recordServed: () => Promise<void>;
  onRecordFailure: (error: unknown) => void;
};

type OverviewDownloadHeadDependencies = Pick<
  OverviewDownloadDependencies,
  "readFile"
>;

function overviewDownloadHeaders(byteLength: number) {
  return {
    "Content-Type": "image/png",
    "Content-Disposition": 'attachment; filename="DM3Oi_Overview_2026.PNG"',
    "Content-Length": String(byteLength),
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function overviewDownloadBody(file: Buffer) {
  const body = new Uint8Array(file.byteLength);
  body.set(file);
  return body;
}

export async function createOverviewDownloadGetResponse({
  readFile,
  recordServed,
  onRecordFailure,
}: OverviewDownloadDependencies) {
  const file = await readFile();
  const response = new Response(overviewDownloadBody(file), {
    headers: overviewDownloadHeaders(file.byteLength),
  });

  try {
    await recordServed();
  } catch (error) {
    onRecordFailure(error);
  }

  return response;
}

export async function createOverviewDownloadHeadResponse({
  readFile,
}: OverviewDownloadHeadDependencies) {
  const file = await readFile();

  return new Response(null, {
    headers: overviewDownloadHeaders(file.byteLength),
  });
}
