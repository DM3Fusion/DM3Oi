"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  isHowToGuideKey,
  parseHowToGuideContent,
  type HowToGuideKey,
} from "@/lib/how-to-guide-content";
import { createClient } from "@/lib/supabase/server";

function field(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function destination(
  guideKey: string,
  status: string,
) {
  return `/admin/how-to-guides?guide=${encodeURIComponent(guideKey)}&${status}`;
}

function parseDraftPayload(
  guideKey: HowToGuideKey,
  raw: string,
) {
  try {
    const value = JSON.parse(raw);
    return parseHowToGuideContent(guideKey, value);
  } catch {
    return null;
  }
}

export async function saveHowToGuideDraftAction(
  form: FormData,
) {
  await requireSuperAdmin();

  const guideKey = field(form, "guideKey");
  const payload = field(form, "content");

  if (!isHowToGuideKey(guideKey)) {
    redirect(destination(guideKey, "error=invalid"));
  }

  const parsed = parseDraftPayload(guideKey, payload);
  if (!parsed) {
    redirect(destination(guideKey, "error=invalid"));
  }

  const supabase = await createClient();
  const result = await supabase.rpc(
    "save_how_to_guide_draft",
    {
      target_guide_key: guideKey,
      target_content: parsed,
    },
  );

  if (result.error) {
    console.error("How-to Guide draft save failed", {
      operation: "saveHowToGuideDraft",
      guideKey,
      code: result.error.code,
      message: result.error.message,
    });

    redirect(destination(guideKey, "error=save"));
  }

  revalidatePath("/admin/how-to-guides");
  redirect(destination(guideKey, "saved=1"));
}

export async function publishHowToGuideAction(
  form: FormData,
) {
  await requireSuperAdmin();

  const guideKey = field(form, "guideKey");

  if (!isHowToGuideKey(guideKey)) {
    redirect(destination(guideKey, "error=invalid"));
  }

  const supabase = await createClient();
  const result = await supabase.rpc(
    "publish_how_to_guide",
    {
      target_guide_key: guideKey,
    },
  );

  if (result.error) {
    console.error("How-to Guide publish failed", {
      operation: "publishHowToGuide",
      guideKey,
      code: result.error.code,
      message: result.error.message,
    });

    redirect(destination(guideKey, "error=publish"));
  }

  revalidatePath("/admin/how-to-guides");
  revalidatePath("/how-to-guide");
  revalidatePath("/staff-how-to-guide");

  redirect(destination(guideKey, "published=1"));
}
