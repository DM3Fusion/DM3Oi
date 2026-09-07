import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET, isOwnedAvatarPath } from "@/lib/profile/avatar";

type StorageClient = {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{
        data: { path: string | null; signedUrl: string | null }[] | null;
        error: unknown;
      }>;
    };
  };
};

export type AvatarProfile = {
  avatar_path: string | null;
  avatar_updated_at: string | null;
};

export type ProfileWithAvatar<T extends AvatarProfile> = T & {
  avatarUrl: string | null;
};

type AuthorizedAvatarProfile = AvatarProfile & { id: string };

const withoutAvatarUrls = <T extends AvatarProfile>(profiles: T[]) =>
  profiles.map((profile) => ({ ...profile, avatarUrl: null }));

export async function attachAvatarUrls<T extends AvatarProfile>(
  supabase: StorageClient,
  profiles: T[],
): Promise<ProfileWithAvatar<T>[]> {
  const withoutUrls = () => withoutAvatarUrls(profiles);
  const paths = [
    ...new Set(
      profiles.flatMap((profile) =>
        profile.avatar_path ? [profile.avatar_path] : [],
      ),
    ),
  ];
  if (!paths.length) return withoutUrls();
  let result: Awaited<
    ReturnType<
      ReturnType<StorageClient["storage"]["from"]>["createSignedUrls"]
    >
  >;
  try {
    result = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrls(paths, 3600);
  } catch {
    return withoutUrls();
  }
  const { data, error } = result;
  if (error || !data) return withoutUrls();
  const urls = new Map(data.map((item) => [item.path, item.signedUrl]));
  return profiles.map((profile) => ({
    ...profile,
    avatarUrl: profile.avatar_path
      ? (urls.get(profile.avatar_path) ?? null)
      : null,
  }));
}

export async function attachAuthorizedAvatarUrls<
  T extends AuthorizedAvatarProfile,
>(profiles: T[]): Promise<ProfileWithAvatar<T>[]> {
  const signableProfiles = profiles.map((profile) => ({
    ...profile,
    avatar_path:
      profile.avatar_path && isOwnedAvatarPath(profile.avatar_path, profile.id)
        ? profile.avatar_path
        : null,
  }));

  try {
    const signed = await attachAvatarUrls(createAdminClient(), signableProfiles);
    return signed.map((profile, index) => ({
      ...profiles[index],
      avatarUrl: profile.avatarUrl,
    }));
  } catch {
    return withoutAvatarUrls(profiles);
  }
}
