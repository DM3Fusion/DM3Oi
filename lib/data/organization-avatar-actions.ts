"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import {
  isOwnedOrganizationAvatarPath,
  isOwnedOrganizationAvatarSourcePath,
  MAX_AVATAR_SOURCE_BYTES,
  MAX_AVATAR_BYTES,
  ORGANIZATION_AVATAR_BUCKET,
  ORGANIZATION_AVATAR_SOURCE_BUCKET,
} from "@/lib/profile/avatar";
import { normalizeAvatarSource, AvatarNormalizationError } from "@/lib/profile/avatar-normalization";

const roles = ["BUSINESS_OWNER", "BUSINESS_ADMIN"] as const;
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function authorize(organizationId: string) {
  const access = await getAccessContext();
  if (!access?.user) throw new Error("UNAUTHORIZED");
  if (access.isSuperAdmin) return;
  const membership = access.organizations.find((org) => org.id === organizationId);
  if (!membership || !roles.includes(membership.role as (typeof roles)[number])) throw new Error("UNAUTHORIZED");
}

export async function normalizeOrganizationAvatarAction(form: FormData) {
  const organizationId = value(form, "organizationId");
  const sourcePath = value(form, "sourcePath");
  const redirectPath = `/admin/organizations/${organizationId}`;
  try {
    await authorize(organizationId);
    if (!isOwnedOrganizationAvatarSourcePath(sourcePath, organizationId)) return { ok: false, error: "Invalid organization avatar source." };
    const supabase = await createClient();
    const source = await supabase.storage.from(ORGANIZATION_AVATAR_SOURCE_BUCKET).download(sourcePath);
    if (source.error || !source.data) return { ok: false, error: "The selected organization avatar could not be read." };
    if (source.data.size > MAX_AVATAR_SOURCE_BYTES) return { ok: false, error: "Organization avatars must be 5 MB or smaller." };
    const extension = sourcePath.split(".").pop() ?? "";
    let normalized: Buffer;
    try {
      normalized = await normalizeAvatarSource(Buffer.from(await source.data.arrayBuffer()), extension);
    } catch (error) {
      if (error instanceof AvatarNormalizationError) return { ok: false, error: error.message };
      throw error;
    }
    if (normalized.byteLength > MAX_AVATAR_BYTES) return { ok: false, error: "The optimized organization avatar is too large." };
    const finalPath = `${organizationId}/avatar-${randomUUID()}.webp`;
    if (!isOwnedOrganizationAvatarPath(finalPath, organizationId)) return { ok: false, error: "The organization avatar could not be saved." };
    const uploaded = await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).upload(finalPath, normalized, { contentType: "image/webp", cacheControl: "3600", upsert: false });
    if (uploaded.error) return { ok: false, error: "The organization avatar could not be saved." };
    const current = await supabase.from("organizations").select("avatar_path").eq("id", organizationId).single();
    if (current.error) { await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).remove([finalPath]); return { ok: false, error: "The organization avatar could not be saved." }; }
    const updated = await supabase.from("organizations").update({ avatar_path: finalPath, avatar_updated_at: new Date().toISOString() }).eq("id", organizationId);
    if (updated.error) { await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).remove([finalPath]); return { ok: false, error: "The organization avatar could not be saved." }; }
    if (current.data.avatar_path && isOwnedOrganizationAvatarPath(current.data.avatar_path, organizationId)) await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).remove([current.data.avatar_path]);
    revalidatePath(redirectPath); revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("Organization avatar normalization failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "The organization avatar could not be processed." };
  } finally {
    if (sourcePath && isOwnedOrganizationAvatarSourcePath(sourcePath, organizationId)) {
      const supabase = await createClient();
      await supabase.storage.from(ORGANIZATION_AVATAR_SOURCE_BUCKET).remove([sourcePath]);
    }
  }
}

export async function removeOrganizationAvatarAction(form: FormData) {
  const organizationId = value(form, "organizationId");
  try {
    await authorize(organizationId);
    const supabase = await createClient();
    const current = await supabase.from("organizations").select("avatar_path").eq("id", organizationId).single();
    if (current.error) return { ok: false, error: "The organization avatar could not be removed." };
    const updated = await supabase.from("organizations").update({ avatar_path: null, avatar_updated_at: null }).eq("id", organizationId);
    if (updated.error) return { ok: false, error: "The organization avatar could not be removed." };
    if (current.data.avatar_path && isOwnedOrganizationAvatarPath(current.data.avatar_path, organizationId)) await supabase.storage.from(ORGANIZATION_AVATAR_BUCKET).remove([current.data.avatar_path]);
    revalidatePath(`/admin/organizations/${organizationId}`); revalidatePath("/");
    return { ok: true };
  } catch (error) {
    console.error("Organization avatar removal failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "The organization avatar could not be removed." };
  }
}
