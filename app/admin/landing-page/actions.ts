"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/context";
import {
  defaultPublicLandingPageContent,
  isPublicLandingPageContent,
  landingPageFeatureKeys,
  type PublicLandingPageContent,
} from "@/lib/public-landing-page";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(
  form: FormData,
  name: string,
) {
  return field(form, name) || undefined;
}

function contentFromForm(
  form: FormData,
  workflowImageUrl: string,
): PublicLandingPageContent | null {
  const content = {
    seo: {
      title: field(form, "seoTitle"),
      description: field(form, "seoDescription"),
    },

    hero: {
      eyebrow: field(form, "heroEyebrow"),
      headlinePrimary: field(form, "heroHeadlinePrimary"),
      headlineSecondary: field(form, "heroHeadlineSecondary"),
      lead: field(form, "heroLead"),
      signInLabel: field(form, "heroSignInLabel"),
      trialLabel: field(form, "heroTrialLabel"),
      points: [
        field(form, "heroPoint0"),
        field(form, "heroPoint1"),
        field(form, "heroPoint2"),
      ].filter(Boolean),
    },

    features: {
      eyebrow: field(form, "featuresEyebrow"),
      heading: field(form, "featuresHeading"),
      lead: field(form, "featuresLead"),
      workflowImageUrl,
      items: landingPageFeatureKeys.map((key) => ({
        key,
        title: field(form, `feature_${key}_title`),
        description: field(
          form,
          `feature_${key}_description`,
        ),
      })),
    },

    value: {
      eyebrow: field(form, "valueEyebrow"),
      heading: field(form, "valueHeading"),
      lead: field(form, "valueLead"),
      points: [
        field(form, "valuePoint0"),
        field(form, "valuePoint1"),
        field(form, "valuePoint2"),
        field(form, "valuePoint3"),
        field(form, "valuePoint4"),
      ],
      panelEyebrow: field(form, "valuePanelEyebrow"),
      panelHeading: field(form, "valuePanelHeading"),
      panelBody: field(form, "valuePanelBody"),
    },

    trialRequest: {
      eyebrow: field(form, "trialRequestEyebrow"),
      heading: field(form, "trialRequestHeading"),
      body: field(form, "trialRequestBody"),
      points: [
        field(form, "trialRequestPoint0"),
        field(form, "trialRequestPoint1"),
        field(form, "trialRequestPoint2"),
      ] as [string, string, string],
      formHeading: optionalField(
        form,
        "trialFormHeading",
      ),
      formBody: optionalField(
        form,
        "trialFormBody",
      ),
      successEyebrow: optionalField(
        form,
        "trialSuccessEyebrow",
      ),
      successHeading: optionalField(
        form,
        "trialSuccessHeading",
      ),
      successBody: optionalField(
        form,
        "trialSuccessBody",
      ),
      returnLabel: optionalField(
        form,
        "trialReturnLabel",
      ),
    },

    cta: defaultPublicLandingPageContent.cta,
  };

  if (!isPublicLandingPageContent(content)) {
    return null;
  }

  return content;
}

export async function saveLandingPageDraft(
  form: FormData,
) {
  const context = await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: existingDraft, error: draftError } =
    await admin
      .from("public_landing_page_drafts")
      .select("content")
      .eq("page_key", "HOME")
      .maybeSingle();

  if (draftError) {
    console.error(
      "SUPER_ADMIN landing-page draft lookup failed:",
      draftError.code,
      draftError.message,
    );

    redirect("/admin/landing-page?error=save");
  }

  const existingContent =
    existingDraft &&
    isPublicLandingPageContent(existingDraft.content)
      ? {
          ...defaultPublicLandingPageContent,
          ...existingDraft.content,
          trialRequest:
            existingDraft.content.trialRequest ??
            defaultPublicLandingPageContent.trialRequest,
        }
      : defaultPublicLandingPageContent;

  const workflowImageUrl =
    existingContent.features.workflowImageUrl ||
    defaultPublicLandingPageContent.features
      .workflowImageUrl;

  const content = contentFromForm(
    form,
    workflowImageUrl,
  );

  if (!content) {
    redirect("/admin/landing-page?error=invalid");
  }

  const { error } = await admin
    .from("public_landing_page_drafts")
    .upsert(
      {
        page_key: "HOME",
        content,
        updated_at: new Date().toISOString(),
        updated_by: context.user.id,
      },
      {
        onConflict: "page_key",
      },
    );

  if (error) {
    console.error(
      "SUPER_ADMIN landing-page draft save failed:",
      error.code,
      error.message,
    );

    redirect("/admin/landing-page?error=save");
  }

  revalidatePath("/admin/landing-page");

  redirect("/admin/landing-page?saved=1");
}

export async function publishLandingPage(
  form: FormData,
) {
  await requireSuperAdmin();

  if (field(form, "confirmation") !== "PUBLISH") {
    redirect("/admin/landing-page?error=confirmation");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "publish_public_landing_page",
  );

  if (error) {
    console.error(
      "SUPER_ADMIN landing-page publication failed:",
      error.code,
      error.message,
    );

    redirect("/admin/landing-page?error=publish");
  }

  const result = Array.isArray(data) ? data[0] : data;
  const version =
    result &&
    typeof result === "object" &&
    "version" in result
      ? String(result.version)
      : "";

  revalidatePath("/");
  revalidatePath("/admin/landing-page");

  redirect(
    `/admin/landing-page?published=${encodeURIComponent(version || "1")}`,
  );
}


export async function revertLandingPageVersion(
  form: FormData,
) {
  await requireSuperAdmin();

  const versionValue = field(form, "version");
  const confirmation = field(form, "confirmation");
  const version = Number(versionValue);

  if (
    !Number.isInteger(version) ||
    version < 1 ||
    confirmation !== `REVERT ${version}`
  ) {
    redirect("/admin/landing-page?error=revert-confirmation");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "revert_public_landing_page",
    {
      target_version: version,
    },
  );

  if (error) {
    console.error(
      "SUPER_ADMIN landing-page revert failed:",
      error.code,
      error.message,
    );

    redirect("/admin/landing-page?error=revert");
  }

  revalidatePath("/");
  revalidatePath("/admin/landing-page");

  redirect(
    `/admin/landing-page?reverted=${encodeURIComponent(
      String(version),
    )}`,
  );
}


const LANDING_PAGE_ASSET_BUCKET = "landing-page-assets";
const LANDING_PAGE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const LANDING_PAGE_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function replaceLandingPageWorkflowImage(
  form: FormData,
) {
  const context = await requireSuperAdmin();
  const image = form.get("workflowImage");

  if (!(image instanceof File) || image.size === 0) {
    redirect("/admin/landing-page?error=image-required");
  }

  const extension =
    LANDING_PAGE_IMAGE_EXTENSIONS[image.type];

  if (!extension) {
    redirect("/admin/landing-page?error=image-type");
  }

  if (image.size > LANDING_PAGE_IMAGE_MAX_BYTES) {
    redirect("/admin/landing-page?error=image-size");
  }

  const admin = createAdminClient();

  const { data: draft, error: draftError } = await admin
    .from("public_landing_page_drafts")
    .select("content")
    .eq("page_key", "HOME")
    .maybeSingle();

  if (draftError) {
    console.error(
      "SUPER_ADMIN landing-page image draft lookup failed:",
      draftError.code,
      draftError.message,
    );

    redirect("/admin/landing-page?error=image");
  }

  const currentContent =
    draft && isPublicLandingPageContent(draft.content)
      ? {
          ...draft.content,
          features: {
            ...draft.content.features,
            workflowImageUrl:
              draft.content.features.workflowImageUrl ||
              defaultPublicLandingPageContent.features
                .workflowImageUrl,
          },
        }
      : defaultPublicLandingPageContent;

  const objectName =
    `home/workflow-${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const bytes = await image.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from(LANDING_PAGE_ASSET_BUCKET)
    .upload(objectName, bytes, {
      contentType: image.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (uploadError) {
    console.error(
      "SUPER_ADMIN landing-page image upload failed:",
      uploadError.message,
    );

    redirect("/admin/landing-page?error=image-upload");
  }

  const { data: publicUrlData } = admin.storage
    .from(LANDING_PAGE_ASSET_BUCKET)
    .getPublicUrl(objectName);

  const workflowImageUrl = publicUrlData.publicUrl;

  if (!workflowImageUrl) {
    console.error(
      "SUPER_ADMIN landing-page image public URL unavailable",
    );

    redirect("/admin/landing-page?error=image");
  }

  const content: PublicLandingPageContent = {
    ...currentContent,
    features: {
      ...currentContent.features,
      workflowImageUrl,
    },
  };

  const { error: updateError } = await admin
    .from("public_landing_page_drafts")
    .upsert(
      {
        page_key: "HOME",
        content,
        updated_at: new Date().toISOString(),
        updated_by: context.user.id,
      },
      {
        onConflict: "page_key",
      },
    );

  if (updateError) {
    console.error(
      "SUPER_ADMIN landing-page image draft update failed:",
      updateError.code,
      updateError.message,
    );

    redirect("/admin/landing-page?error=image");
  }

  revalidatePath("/admin/landing-page");

  redirect("/admin/landing-page?imageReplaced=1");
}
