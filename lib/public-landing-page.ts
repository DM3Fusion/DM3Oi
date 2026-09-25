export const landingPageFeatureKeys = [
  "inbox",
  "service",
  "cases",
  "tasks",
  "rules",
  "secure",
] as const;

export type LandingPageFeatureKey =
  (typeof landingPageFeatureKeys)[number];

export type PublicLandingPageContent = {
  seo: {
    title: string;
    description: string;
  };
  hero: {
    eyebrow: string;
    headlinePrimary: string;
    headlineSecondary: string;
    lead: string;
    signInLabel: string;
    trialLabel: string;
    points: string[];
  };
  features: {
    eyebrow: string;
    heading: string;
    lead: string;
    workflowImageUrl: string | null;
    items: {
      key: LandingPageFeatureKey;
      title: string;
      description: string;
    }[];
  };
  value: {
    eyebrow: string;
    heading: string;
    lead: string;
    points: [string, string, string, string, string];
    panelEyebrow: string;
    panelHeading: string;
    panelBody: string;
  };
  trialRequest?: {
    eyebrow: string;
    heading: string;
    body: string;
    points: [string, string, string];
    heroImageUrl?: string;
    formHeading?: string;
    formBody?: string;
    successEyebrow?: string;
    successHeading?: string;
    successBody?: string;
    returnLabel?: string;
  };
  cta: {
    eyebrow: string;
    heading: string;
    body: string;
    buttonLabel: string;
  };
};

export const defaultPublicLandingPageContent: PublicLandingPageContent = {
  seo: {
    title: "DM3Oi™ | Business Operations Intelligence",
    description:
      "DM3Oi™ brings customer requests, communications, cases, tasks, workflows, and operational insight together in one secure web-based workspace.",
  },

  hero: {
    eyebrow: "Business Operations Intelligence",
    headlinePrimary: "People. Work.",
    headlineSecondary: "Progress. Intelligence.",
    lead:
      "DM3Oi™ brings customer requests, communications, cases, tasks, workflows, and operational insight together in one secure web-based workspace.",
    signInLabel: "Sign In to DM3Oi",
    trialLabel: "Request Trial",
    points: [
      "Customer service",
      "Accountable work",
      "Operational intelligence",
    ],
  },

  features: {
    eyebrow: "Business workflow",
    heading: "Everything you need to keep operational work moving",
    lead:
      "Keep customer requests, communications, cases, tasks, operating rules, and team access organized within one business platform.",
    workflowImageUrl:
      "/brand/dm3oi-workflow-panels-baseline.png",
    items: [
      {
        key: "service",
        title: "Service Desk",
        description:
          "Receive, assign, track, and resolve customer service requests.",
      },
      {
        key: "inbox",
        title: "Inbox",
        description:
          "Keep operational communications visible and connected to the work.",
      },
      {
        key: "cases",
        title: "Cases",
        description:
          "Organize customer work, responsibility, progress, and history.",
      },
      {
        key: "tasks",
        title: "Tasks",
        description:
          "Turn operational requirements into clear, accountable work.",
      },
      {
        key: "rules",
        title: "Questions & Rules",
        description:
          "Use structured questions and rules to guide repeatable workflows.",
      },
      {
        key: "secure",
        title: "Secure Access",
        description:
          "Use email verification and organization-based workspace access.",
      },
    ],
  },

  value: {
    eyebrow: "Business value",
    heading:
      "Keep operational work organized from request to outcome.",
    lead:
      "Give customer service, responsibility, work progress, communication, and operational visibility a consistent place within your organization.",
    points: [
      "Keep customer requests and communications organized",
      "Maintain clear ownership and responsibility",
      "Connect cases, tasks, and service activity",
      "Preserve operational history and progress",
      "Manage access by organization role",
    ],
    panelEyebrow: "Organization-based access",
    panelHeading:
      "Business operational information stays within the appropriate workspace.",
    panelBody:
      "DM3Oi combines email verification with organization-based access so users enter the workspace associated with their business role.",
  },

  trialRequest: {
    eyebrow: "Getting Started.",
    heading: "See whether DM3Oi fits your operational needs.",
    body:
      "Tell us a little about your organization and operational needs. Your request can be reviewed before a DM3Oi workspace is provisioned.",
    points: [
      "Secure organization workspace",
      "Customer service and operational workflow",
      "Cases, tasks, communications, and intelligence",
    ],
    heroImageUrl: "/images/dm3oi-operations-hero.jpg",
    formHeading: "Trial Request",
    formBody:
      "Required fields help us understand the appropriate starting configuration for your organization.",
    successEyebrow: "Request Received",
    successHeading:
      "Thank you for your interest in DM3Oi.",
    successBody:
      "Your trial request has been received for review. We will use the information you provided to evaluate the appropriate workspace configuration.",
    returnLabel: "Return to DM3Oi",
  },

  cta: {
    eyebrow: "DM3Oi™ Business Operations Intelligence",
    heading: "People. Work. Progress. Intelligence.",
    body:
      "Access your organization's DM3Oi workspace to continue managing operational work.",
    buttonLabel: "Sign In to DM3Oi",
  },
};

function isString(
  value: unknown,
  maxLength: number,
) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isLandingPageImageUrl(value: unknown) {
  if (value === undefined || value === null) return true;

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 1000
  ) {
    return false;
  }

  return (
    value.startsWith("/brand/") ||
    value.startsWith("/images/") ||
    value.startsWith("https://")
  );
}

function isStringArray(
  value: unknown,
  length: number,
  maxLength: number,
) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) =>
      isString(item, maxLength),
    )
  );
}

export function isPublicLandingPageContent(
  value: unknown,
): value is PublicLandingPageContent {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const content =
    value as Partial<PublicLandingPageContent>;

  if (
    !content.seo ||
    !isString(content.seo.title, 160) ||
    !isString(content.seo.description, 320) ||
    !content.hero ||
    !isString(content.hero.eyebrow, 80) ||
    !isString(content.hero.headlinePrimary, 120) ||
    !isString(content.hero.headlineSecondary, 120) ||
    !(
      typeof content.hero.lead === "string" &&
      content.hero.lead.length <= 600
    ) ||
    !isString(content.hero.signInLabel, 80) ||
    !isString(content.hero.trialLabel, 80) ||
    !Array.isArray(content.hero.points) ||
    content.hero.points.length > 3 ||
    !content.hero.points.every((point) =>
      isString(point, 160),
    ) ||
    !content.features ||
    !isString(content.features.eyebrow, 80) ||
    !isString(content.features.heading, 180) ||
    !isString(content.features.lead, 600) ||
    !isLandingPageImageUrl(
      content.features.workflowImageUrl,
    ) ||
    !Array.isArray(content.features.items) ||
    content.features.items.length !==
      landingPageFeatureKeys.length ||
    !content.value ||
    !isString(content.value.eyebrow, 80) ||
    !isString(content.value.heading, 220) ||
    !isString(content.value.lead, 600) ||
    !isStringArray(content.value.points, 5, 220) ||
    !isString(content.value.panelEyebrow, 100) ||
    !isString(content.value.panelHeading, 260) ||
    !isString(content.value.panelBody, 800) ||
    (content.trialRequest !== undefined &&
      (!content.trialRequest ||
        !isString(content.trialRequest.eyebrow, 100) ||
        !isString(content.trialRequest.heading, 260) ||
        !isString(content.trialRequest.body, 800) ||
        !isStringArray(
          content.trialRequest.points,
          3,
          220,
        ) ||
        !isLandingPageImageUrl(
          content.trialRequest.heroImageUrl,
        ) ||
        (content.trialRequest.formHeading !== undefined &&
          !isString(
            content.trialRequest.formHeading,
            160,
          )) ||
        (content.trialRequest.formBody !== undefined &&
          !isString(
            content.trialRequest.formBody,
            500,
          )) ||
        (content.trialRequest.successEyebrow !== undefined &&
          !isString(
            content.trialRequest.successEyebrow,
            100,
          )) ||
        (content.trialRequest.successHeading !== undefined &&
          !isString(
            content.trialRequest.successHeading,
            260,
          )) ||
        (content.trialRequest.successBody !== undefined &&
          !isString(
            content.trialRequest.successBody,
            800,
          )) ||
        (content.trialRequest.returnLabel !== undefined &&
          !isString(
            content.trialRequest.returnLabel,
            80,
          )))) ||
    !content.cta ||
    !isString(content.cta.eyebrow, 100) ||
    !isString(content.cta.heading, 220) ||
    !isString(content.cta.body, 600) ||
    !isString(content.cta.buttonLabel, 80)
  ) {
    return false;
  }

  const seen = new Set<string>();

  for (const item of content.features.items) {
    if (
      !item ||
      !landingPageFeatureKeys.includes(
        item.key as LandingPageFeatureKey,
      ) ||
      seen.has(item.key) ||
      !isString(item.title, 140) ||
      !isString(item.description, 500)
    ) {
      return false;
    }

    seen.add(item.key);
  }

  return landingPageFeatureKeys.every((key) =>
    seen.has(key),
  );
}

export function normalizePublicLandingPageContent(
  content: PublicLandingPageContent,
): PublicLandingPageContent {
  return {
    ...content,
    features: {
      ...content.features,
      workflowImageUrl:
        content.features.workflowImageUrl === undefined
          ? defaultPublicLandingPageContent.features
              .workflowImageUrl
          : content.features.workflowImageUrl,
    },
    trialRequest: {
      ...defaultPublicLandingPageContent.trialRequest!,
      ...(content.trialRequest ?? {}),
      heroImageUrl:
        content.trialRequest?.heroImageUrl === undefined
          ? defaultPublicLandingPageContent.trialRequest!
              .heroImageUrl
          : content.trialRequest.heroImageUrl,
    },
  };
}
