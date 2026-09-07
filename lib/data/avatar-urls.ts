import "server-only";
import { AVATAR_BUCKET } from "@/lib/profile/avatar";

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

export async function attachAvatarUrls<T extends AvatarProfile>(
  supabase: StorageClient,
  profiles: T[],
): Promise<ProfileWithAvatar<T>[]> {
  const withoutUrls = () =>
    profiles.map((profile) => ({ ...profile, avatarUrl: null }));
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
