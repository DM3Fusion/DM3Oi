import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const filePath = path.join(
    process.cwd(),
    "public",
    "images",
    "DM3Oi_Overview_2026.PNG",
  );

  const file = await readFile(filePath);

  return new Response(file, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="DM3Oi_Overview_2026.PNG"',
      "Content-Length": String(file.byteLength),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
