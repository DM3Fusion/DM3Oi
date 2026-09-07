"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedInternalUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  AVATAR_BUCKET,
  AVATAR_SOURCE_BUCKET,
  createAvatarPath,
  isOwnedAvatarSourcePath,
  isOwnedAvatarPath,
} from "@/lib/profile/avatar";
import { validateDisplayName } from "@/lib/profile/identity";
import {
  AvatarNormalizationError,
  normalizeAvatarSource,
} from "@/lib/profile/avatar-normalization";

const profilePath = "/account/profile";
const go = (key: "error" | "message", message: string): never =>
  redirect(`${profilePath}?${key}=${encodeURIComponent(message)}`);

export type ProfileUpdateResult =
  | { ok: true; values: { displayName: string } }
  | { ok: false; values: { displayName: string }; error: string };

export async function updateOwnProfileAction(form: FormData): Promise<ProfileUpdateResult> {
  const access = await requireAuthenticatedInternalUser();
  const submittedDisplayName = String(form.get("displayName") ?? "");
  const validated = validateDisplayName(submittedDisplayName);
  if (!validated.ok)
    return {
      ok: false,
      values: { displayName: submittedDisplayName },
      error: validated.error,
    };
  const { displayName } = validated;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", access.user.id);
  if (error)
    return {
      ok: false,
      values: { displayName: submittedDisplayName },
      error: "Your profile could not be updated.",
    };
  revalidatePath("/", "layout");
  revalidatePath(profilePath);
  return { ok: true, values: { displayName } };
}

export async function normalizeOwnAvatarAction(form: FormData) {
  const access = await requireAuthenticatedInternalUser();
  const sourcePath = String(form.get("sourcePath") ?? "").trim();
  const sourceMatch = sourcePath.match(
    /\/source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i,
  );

  if (!isOwnedAvatarSourcePath(sourcePath, access.user.id) || !sourceMatch) {
    return {
      ok: false as const,
      error: "The selected image could not be prepared.",
    };
  }

  const supabase = await createClient();
  let finalPath: string | null = null;
  try {
    const { data: source, error: downloadError } = await supabase.storage
      .from(AVATAR_SOURCE_BUCKET)
      .download(sourcePath);
    if (downloadError || !source) {
      return { ok: false as const, error: "The selected image could not be loaded." };
    }

    const normalized = await normalizeAvatarSource(
      Buffer.from(await source.arrayBuffer()),
      sourceMatch[1],
    );

    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", access.user.id)
      .single();

    if (readError) {
      return { ok: false as const, error: "Your profile could not be loaded." };
    }

    finalPath = createAvatarPath(access.user.id);

    const { error: uploadError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(finalPath, normalized, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) return { ok: false as const, error: "The final avatar could not be stored." };

    const { error: profileError } = await supabase.rpc("set_own_avatar_path", {
      target_avatar_path: finalPath,
    });

    if (profileError) {
      console.error("DM3Oi avatar profile RPC failed", {
        code: profileError.code,
        message: profileError.message,
        details: profileError.details,
        hint: profileError.hint,
        userId: access.user.id,
        avatarPath: finalPath,
      });

      await supabase.storage.from(AVATAR_BUCKET).remove([finalPath]);

      return { ok: false as const, error: "The avatar could not be attached to your profile." };
    }

    if (current?.avatar_path && isOwnedAvatarPath(current.avatar_path, access.user.id))
      await supabase.storage.from(AVATAR_BUCKET).remove([current.avatar_path]);

    revalidatePath("/", "layout");
    return { ok: true as const, message: "Avatar updated." };
  } catch (error) {
    if (finalPath) await supabase.storage.from(AVATAR_BUCKET).remove([finalPath]);
    if (error instanceof AvatarNormalizationError) {
      return {
        ok: false as const,
        error:
          error.reason === "unsafe"
            ? "This image is too large to process safely."
            : error.reason === "oversized"
              ? "The processed avatar could not fit within the storage limit."
              : "This image is invalid or unsupported.",
      };
    }
    console.error("DM3Oi avatar normalization failed", {
      userId: access.user.id,
      sourcePath,
      message: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false as const, error: "Avatar processing failed." };
  } finally {
    const { error } = await supabase.storage
      .from(AVATAR_SOURCE_BUCKET)
      .remove([sourcePath]);
    if (error)
      console.error("DM3Oi temporary avatar cleanup failed", {
        userId: access.user.id,
        sourcePath,
        message: error.message,
      });
  }
}

export async function removeOwnAvatarAction() {
  const access = await requireAuthenticatedInternalUser();
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", access.user.id)
    .single();
  if (readError) go("error", "Your profile could not be loaded.");
  const { error } = await supabase.rpc("set_own_avatar_path", {
    // Supabase-generated RPC args do not express nullable function parameters.
    target_avatar_path: null as unknown as string,
  });
  if (error) go("error", "Your avatar could not be removed.");
  if (
    current?.avatar_path &&
    isOwnedAvatarPath(current.avatar_path, access.user.id)
  )
    await supabase.storage.from(AVATAR_BUCKET).remove([current.avatar_path]);
  revalidatePath("/", "layout");
  go("message", "Avatar removed.");
}
