"use server";

import { revalidatePath } from "next/cache";
import { getAccessContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { getPlatformAdminUserIds } from "@/lib/data/platform-privacy";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  AVATAR_BUCKET,
  AVATAR_SOURCE_BUCKET,
  MAX_AVATAR_SOURCE_BYTES,
  avatarSourceExtension,
  createAvatarPath,
  createAvatarSourcePath,
  isOwnedAvatarPath,
  isOwnedAvatarSourcePath,
} from "@/lib/profile/avatar";
import {
  AvatarNormalizationError,
  normalizeAvatarSource,
} from "@/lib/profile/avatar-normalization";
import { validateDisplayName } from "@/lib/profile/identity";

const value = (form: FormData, key: string) =>
  String(form.get(key) ?? "").trim();
const denied = "You are not authorized to manage this organization user.";

type AuthorizedTarget = {
  actorUserId: string;
  organizationId: string;
  membershipId: string;
  profile: {
    id: string;
    display_name: string | null;
    avatar_path: string | null;
  };
};

async function authorizeTarget(membershipId: string): Promise<AuthorizedTarget> {
  const access = await getAccessContext();
  const organizationId = access?.activeOrganization?.id;
  if (
    !access?.user ||
    !organizationId ||
    !membershipId ||
    !hasPermission(access, "MANAGE_USERS")
  )
    throw new Error("UNAUTHORIZED");

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id,user_id,organization_id,profiles(id,display_name,avatar_path)")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) throw new Error("UNAUTHORIZED");
  if ((await getPlatformAdminUserIds()).has(membership.user_id))
    throw new Error("UNAUTHORIZED");

  const profile = Array.isArray(membership.profiles)
    ? membership.profiles[0]
    : membership.profiles;
  if (!profile || profile.id !== membership.user_id)
    throw new Error("UNAUTHORIZED");

  return {
    actorUserId: access.user.id,
    organizationId,
    membershipId: membership.id,
    profile,
  };
}

function audit(target: AuthorizedTarget, event: string) {
  console.info("DM3Oi delegated profile change", {
    event,
    actorUserId: target.actorUserId,
    organizationId: target.organizationId,
    membershipId: target.membershipId,
    targetProfileId: target.profile.id,
    occurredAt: new Date().toISOString(),
  });
}

function avatarError(error: unknown) {
  if (!(error instanceof AvatarNormalizationError))
    return "The selected image could not be processed.";
  return error.reason === "unsafe"
    ? "This image is too large to process safely."
    : error.reason === "oversized"
      ? "The selected image must be 5 MB or smaller after processing."
      : "Choose a valid JPEG, PNG, or WEBP image.";
}

function refresh(membershipId: string) {
  revalidatePath("/users");
  revalidatePath(`/users/${membershipId}`);
  revalidatePath("/", "layout");
}

export async function prepareOrganizationUserAvatarUploadAction(form: FormData) {
  const membershipId = value(form, "membershipId");
  const contentType = value(form, "contentType").toLowerCase();
  if (!avatarSourceExtension(contentType))
    return { ok: false as const, error: "Choose a JPEG, PNG, or WEBP image." };

  try {
    const target = await authorizeTarget(membershipId);
    const sourcePath = createAvatarSourcePath(target.profile.id, contentType)!;
    const { data, error } = await createAdminClient()
      .storage.from(AVATAR_SOURCE_BUCKET)
      .createSignedUploadUrl(sourcePath);
    if (error || !data)
      return { ok: false as const, error: "The selected image could not be prepared." };
    return {
      ok: true as const,
      sourcePath,
      sourceReference: sourcePath.split("/")[1],
      token: data.token,
    };
  } catch {
    return { ok: false as const, error: denied };
  }
}

export async function updateOrganizationUserProfileAction(form: FormData) {
  const membershipId = value(form, "membershipId");
  const validatedName = validateDisplayName(form.get("displayName"));
  if (!validatedName.ok)
    return { ok: false as const, error: validatedName.error };

  const sourceReference = value(form, "sourceReference");
  let sourcePath: string | null = null;
  let uploadedPath: string | null = null;
  try {
    const target = await authorizeTarget(membershipId);
    const admin = createAdminClient();
    let normalized: Buffer | null = null;
    const displayNameChanged =
      target.profile.display_name !== validatedName.displayName;

    if (sourceReference) {
      if (
        !/^source-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$/.test(
          sourceReference,
        )
      )
        return { ok: false as const, error: "The selected image could not be prepared." };
      sourcePath = `${target.profile.id}/${sourceReference}`;
      if (!isOwnedAvatarSourcePath(sourcePath, target.profile.id))
        return { ok: false as const, error: "The selected image could not be prepared." };
      const source = await admin.storage
        .from(AVATAR_SOURCE_BUCKET)
        .download(sourcePath);
      if (source.error || !source.data || source.data.size > MAX_AVATAR_SOURCE_BYTES)
        return { ok: false as const, error: "The selected image could not be loaded." };
      try {
        normalized = await normalizeAvatarSource(
          Buffer.from(await source.data.arrayBuffer()),
          sourcePath.split(".").pop() ?? "",
        );
      } catch (error) {
        return { ok: false as const, error: avatarError(error) };
      }
      uploadedPath = createAvatarPath(target.profile.id);
      const upload = await admin.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedPath, normalized, {
          cacheControl: "3600",
          contentType: "image/webp",
          upsert: false,
        });
      if (upload.error)
        return { ok: false as const, error: "The avatar could not be stored." };
    }

    if (!displayNameChanged && !uploadedPath)
      return {
        ok: true as const,
        displayName: validatedName.displayName,
        avatarChanged: false,
      };

    const update = await admin
      .from("profiles")
      .update({
        display_name: validatedName.displayName,
        ...(uploadedPath
          ? {
              avatar_path: uploadedPath,
              avatar_updated_at: new Date().toISOString(),
            }
          : {}),
      })
      .eq("id", target.profile.id)
      .select("id")
      .maybeSingle();
    if (update.error || !update.data) {
      if (uploadedPath)
        await admin.storage.from(AVATAR_BUCKET).remove([uploadedPath]);
      return { ok: false as const, error: "The employee profile could not be updated." };
    }

    if (
      uploadedPath &&
      target.profile.avatar_path &&
      isOwnedAvatarPath(target.profile.avatar_path, target.profile.id)
    ) {
      const cleanup = await admin.storage
        .from(AVATAR_BUCKET)
        .remove([target.profile.avatar_path]);
      if (cleanup.error)
        console.error("DM3Oi replaced avatar cleanup failed", {
          membershipId: target.membershipId,
          targetProfileId: target.profile.id,
        });
    }

    audit(
      target,
      uploadedPath
        ? displayNameChanged
          ? "AVATAR_AND_DISPLAY_NAME_CHANGED"
          : "AVATAR_CHANGED"
        : "DISPLAY_NAME_CHANGED",
    );
    refresh(membershipId);
    return {
      ok: true as const,
      displayName: validatedName.displayName,
      avatarChanged: Boolean(uploadedPath),
    };
  } catch {
    if (uploadedPath) {
      try {
        await createAdminClient().storage.from(AVATAR_BUCKET).remove([uploadedPath]);
      } catch {}
    }
    return { ok: false as const, error: denied };
  } finally {
    if (sourcePath) {
      try {
        await createAdminClient().storage.from(AVATAR_SOURCE_BUCKET).remove([sourcePath]);
      } catch {}
    }
  }
}

export async function removeOrganizationUserAvatarAction(form: FormData) {
  const membershipId = value(form, "membershipId");
  try {
    const target = await authorizeTarget(membershipId);
    const admin = createAdminClient();
    if (!target.profile.avatar_path) return { ok: true as const };
    const update = await admin
      .from("profiles")
      .update({ avatar_path: null, avatar_updated_at: null })
      .eq("id", target.profile.id)
      .select("id")
      .maybeSingle();
    if (update.error || !update.data)
      return { ok: false as const, error: "The employee avatar could not be removed." };

    if (
      target.profile.avatar_path &&
      isOwnedAvatarPath(target.profile.avatar_path, target.profile.id)
    ) {
      const cleanup = await admin.storage
        .from(AVATAR_BUCKET)
        .remove([target.profile.avatar_path]);
      if (cleanup.error)
        console.error("DM3Oi removed avatar cleanup failed", {
          membershipId: target.membershipId,
          targetProfileId: target.profile.id,
        });
    }

    audit(target, "AVATAR_REMOVED");
    refresh(membershipId);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: denied };
  }
}
