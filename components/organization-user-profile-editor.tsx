"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  prepareOrganizationUserAvatarUploadAction,
  removeOrganizationUserAvatarAction,
  updateOrganizationUserProfileAction,
} from "@/lib/data/organization-profile-actions";
import {
  AVATAR_SOURCE_BUCKET,
  AVATAR_SOURCE_TYPES,
  MAX_AVATAR_SOURCE_BYTES,
} from "@/lib/profile/avatar";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/profile/identity";

export function OrganizationUserProfileEditor({
  membershipId,
  displayName,
  email,
  hasAvatar,
}: {
  membershipId: string;
  displayName: string;
  email: string;
  hasAvatar: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const allowedTypes = new Set<string>(AVATAR_SOURCE_TYPES);

  function close() {
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
    setSelectedFileName(null);
    dialog.current?.close();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const source = fileInput.current?.files?.[0];
      if (source) {
        if (!allowedTypes.has(source.type)) {
          setError("Choose a JPEG, PNG, or WEBP image.");
          return;
        }
        if (source.size > MAX_AVATAR_SOURCE_BYTES) {
          setError("The selected image must be 5 MB or smaller.");
          return;
        }
        const preparation = new FormData();
        preparation.set("membershipId", membershipId);
        preparation.set("contentType", source.type);
        const prepared =
          await prepareOrganizationUserAvatarUploadAction(preparation);
        if (!prepared.ok) {
          setError(prepared.error);
          return;
        }
        const upload = await createClient()
          .storage.from(AVATAR_SOURCE_BUCKET)
          .uploadToSignedUrl(prepared.sourcePath, prepared.token, source, {
            cacheControl: "300",
            contentType: source.type,
          });
        if (upload.error) {
          setError("The selected image could not be uploaded.");
          return;
        }
        form.set("sourceReference", prepared.sourceReference);
      }
      const result = await updateOrganizationUserProfileAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("The employee profile could not be updated.");
    } finally {
      setPending(false);
    }
  }

  async function removeAvatar() {
    if (pending) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("membershipId", membershipId);
    try {
      const result = await removeOrganizationUserAvatarAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("The employee avatar could not be removed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="secondary-button"
        onClick={() => dialog.current?.showModal()}
      >
        Edit Profile
      </button>
      <dialog
        ref={dialog}
        className="organization-profile-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!pending) close();
        }}
      >
        <form className="entity-form" onSubmit={save}>
          <input type="hidden" name="membershipId" value={membershipId} />
          <div>
            <h2>Edit employee profile</h2>
            <p>Update this user’s organization-facing identity.</p>
          </div>
          <div className="form-grid">
            <label>
              <span>Display Name</span>
              <input
                name="displayName"
                defaultValue={displayName}
                required
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                disabled={pending}
              />
            </label>
            <label>
              <span>Email</span>
              <input value={email} readOnly />
              <small>Authentication email is read-only.</small>
            </label>
            <div className="full organization-profile-photo-field">
              <span>Avatar</span>
              <input
                ref={fileInput}
                type="file"
                accept={AVATAR_SOURCE_TYPES.join(",")}
                disabled={pending}
                aria-label="Choose employee profile photo"
                hidden
                onChange={(event) => {
                  setSelectedFileName(event.currentTarget.files?.[0]?.name ?? null);
                  setError(null);
                }}
              />
              <div>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pending}
                  onClick={() => fileInput.current?.click()}
                >
                  Change Photo
                </button>
                <small>
                  {selectedFileName ?? "JPEG, PNG, or WEBP · up to 5 MB"}
                </small>
              </div>
            </div>
          </div>
          {error ? (
            <div className="form-alert" role="alert">
              {error}
            </div>
          ) : null}
          <div className="organization-profile-actions">
            {hasAvatar ? (
              <button
                type="button"
                className="text-button"
                disabled={pending}
                onClick={() => void removeAvatar()}
              >
                Remove Photo
              </button>
            ) : (
              <span />
            )}
            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={pending}>
                {pending ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
