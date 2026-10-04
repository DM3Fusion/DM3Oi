export type LegalDocumentSection = {
  heading: string;
  paragraphs: readonly string[];
};

export const legalDocumentKeys = [
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
] as const;

export type LegalDocumentKey = (typeof legalDocumentKeys)[number];

export type LegalDocumentContent = {
  type: LegalDocumentKey;
  title: string;
  introduction: readonly string[];
  sections: readonly LegalDocumentSection[];
};

export type LegalDocumentDefinition = LegalDocumentContent & {
  version: string;
  effectiveDate: string;
};

export const termsOfService = {
  type: "TERMS_OF_SERVICE",
  title: "Terms of Service",
  version: "1.1",
  effectiveDate: "2026-10-04",
  introduction: [
    "These Terms of Service govern access to and use of DM3Oi Business Operations Intelligence by a customer organization and its authorized users.",
    "By accepting these Terms on behalf of an organization, the Business Owner represents that the Business Owner has authority to bind the organization to these Terms. The organization is responsible for use of DM3Oi by its authorized users.",
  ],
  // Dedicated or standalone deployments require separate written terms and
  // are intentionally outside these public hosted-service Terms.
  sections: [
    {
      heading: "1. Fees",
      paragraphs: [
        "During this unspecified period, system access is provided to participating organizations without charge. Unless otherwise agreed in writing, participation during this period does not create an obligation to later purchase a paid subscription. DM3Oi may introduce paid plans, fees, or other commercial terms in the future. Any such terms applicable to an organization will be communicated separately before they become effective for that organization.",
      ],
    },
    {
      heading: "2. Service",
      paragraphs: [
        "DM3Oi is a hosted business-operations software service that may include customer, case, task, service-request, communications, workflow, reporting, and operational-intelligence functionality. The available features may depend on the organization's configuration and applicable service arrangement.",
        "The service may be changed, improved, maintained, suspended, or discontinued as it evolves. These Terms do not promise uninterrupted or error-free availability.",
      ],
    },
    {
      heading: "3. Organization Accounts and Authorized Users",
      paragraphs: [
        "The customer organization is responsible for determining who may access its account, assigning appropriate roles, maintaining accurate account information, and promptly removing access that is no longer authorized.",
        "Authorized users must use DM3Oi in accordance with these Terms, the organization's policies, and applicable law, and must take reasonable measures to protect credentials, authentication methods, devices, and account access.",
        "The organization is responsible for actions taken through accounts and access credentials it authorizes, except to the extent an unauthorized action is caused by DM3Oi's own security failure. Suspected unauthorized access should be reported promptly through the organization's established DM3Oi support or administrative contact channel.",
      ],
    },
    {
      heading: "4. Customer Data",
      paragraphs: [
        "Customer Data includes information, records, customer and contact information, cases, tasks, service requests, communications, responses, reports, files, and other content submitted to or created through DM3Oi for the organization.",
        "As between the organization and DM3Oi, the organization retains ownership and control of Customer Data it submits. These Terms do not transfer ownership of Customer Data to DM3Oi.",
        "The organization is responsible for the accuracy, legality, appropriateness, and authorization of Customer Data. The organization represents that it has the rights, permissions, notices, and consents reasonably necessary to submit and use Customer Data through DM3Oi.",
        "The organization grants DM3Oi a limited right to host, process, transmit, reproduce, back up, secure, and otherwise use Customer Data only as reasonably necessary to provide, support, secure, improve, and operate the service and to satisfy applicable legal obligations, subject to the Privacy Policy and applicable law.",
      ],
    },
    {
      heading: "5. Acceptable Use and Security",
      paragraphs: [
        "Users may not use DM3Oi for unlawful activity; attempt unauthorized access; circumvent security or access controls; share credentials outside authorized organizational use; introduce malicious code; engage in abusive or unauthorized automated access; interfere with platform availability or integrity; misuse another person's credentials; or access, disclose, alter, or misuse another organization's information without authorization.",
        "Authorized integrations and automation are not prohibited merely because they are automated, but they must operate within documented or approved access methods and must not compromise the security, availability, or integrity of the service or another customer's data.",
      ],
    },
    {
      heading: "6. License and Access",
      paragraphs: [
        "Subject to these Terms and any applicable written service arrangement, DM3Oi grants the organization a limited, non-exclusive, non-transferable right, except as expressly allowed by written agreement, for its authorized users to access and use the hosted service for the organization's internal business operations.",
        "These access rights do not transfer ownership of the software, source code, platform, or underlying technology. Access may be limited, suspended, or terminated when the applicable organization access is no longer active or when otherwise permitted under these Terms.",
      ],
    },
    {
      heading: "7. Intellectual Property",
      paragraphs: [
        "The DM3Oi software, platform architecture, workflows, designs, documentation, trademarks, and reusable technology remain owned by DM3Oi, the service provider, or their licensors, as applicable. Except for the limited hosted-service access rights stated in these Terms or a separate written agreement, no ownership interest in those materials is transferred to the organization or an authorized user.",
        "Customer Data remains the organization's as described in Section 4. If the organization or an authorized user provides feedback, suggestions, or ideas about the service, DM3Oi may use them to improve or develop the service without creating ownership rights in Customer Data or the organization's confidential information.",
      ],
    },
    {
      heading: "8. Third-Party Services",
      paragraphs: [
        "DM3Oi may rely on third-party providers for hosting, database, authentication, storage, email, mapping or geocoding, communications, monitoring, and other infrastructure or services used to operate and support DM3Oi.",
        "Third-party availability, changes, outages, or failures may affect DM3Oi. Use of third-party infrastructure to provide the service does not transfer ownership of Customer Data to DM3Oi or those providers, although Customer Data may be processed by them as reasonably necessary to perform their services, subject to applicable agreements and law.",
      ],
    },
    {
      heading: "9. Service Availability and Changes",
      paragraphs: [
        "DM3Oi may experience maintenance, upgrades, outages, network failures, provider interruptions, software defects, security changes, or other events that affect availability. Continuous, uninterrupted, or error-free operation is not guaranteed.",
        "Features may be added, modified, deprecated, suspended, or discontinued as the service evolves. When practicable, DM3Oi may provide reasonable notice of a material change that substantially affects organization use, but emergency, legal, security, integrity, or provider-driven changes may occur without advance notice.",
      ],
    },
    {
      heading: "10. Reports, Outputs, and Business Reliance",
      paragraphs: [
        "Reports, workflow states, calculations, notifications, operational intelligence, and other system outputs depend on Customer Data, configuration, user actions, and available system information. They provide informational and operational support and do not make decisions for the organization.",
        "The organization is responsible for reviewing outputs before relying on them for business, contractual, regulatory, safety, tax, accounting, financial, or other material decisions. DM3Oi does not replace legal, accounting, tax, regulatory, financial, or other professional advice or independent business judgment.",
        "DM3Oi does not guarantee that Customer Data or system-generated outputs are complete, error-free, suitable for a particular purpose, or sufficient to satisfy any independent legal, contractual, regulatory, or professional requirement.",
      ],
    },
    {
      heading: "11. Data Preservation, Export, and Loss",
      paragraphs: [
        "DM3Oi uses reasonable measures intended to operate and protect the service and may maintain backup or recovery controls, but no hosted system can guarantee against every loss, corruption, deletion, interruption, or unauthorized event, and recovery of every deleted or corrupted item is not guaranteed.",
        "The organization is responsible for independently maintaining records it is legally or operationally required to retain where appropriate and for reviewing any exported or delivered materials for completeness. The availability and method of data export, retention, or deletion may depend on the applicable service arrangement and does not necessarily include self-service export functionality.",
        "Following suspension, termination, or loss of access, data handling, availability, retention, export, or deletion may be governed by applicable service practices, legal obligations, and any separate written agreement with the organization. No specific retention period is promised by these Terms.",
      ],
    },
    {
      heading: "12. Confidentiality and Privacy",
      paragraphs: [
        "DM3Oi will handle personal information and Customer Data as described in the Privacy Policy and will use reasonable measures designed to protect information under its control.",
        "The organization is responsible for determining whether its use of DM3Oi and the information it collects through the service requires additional notices, permissions, agreements, or safeguards.",
      ],
    },
    {
      heading: "13. Product Measurement and Aggregated Results",
      paragraphs: [
        "DM3Oi may analyze service usage, workflow activity, operational performance, and related platform metrics to evaluate and improve the service and to understand its effectiveness in real-world use.",
        "DM3Oi may use aggregated or de-identified information for product analysis, benchmarking, research, service improvement, and public descriptions of platform performance, trends, or results, provided that the information does not reasonably identify the customer organization, its customers, or individual users.",
        "Identifiable Customer Data, customer organization names, testimonials, or organization-specific results will not be used for public marketing or public descriptions without separate authorization.",
      ],
    },
    {
      heading: "14. Electronic Communications",
      paragraphs: [
        "Operational, administrative, security, account, service, and legal notices relating to DM3Oi may be delivered electronically through the service or an established electronic contact channel. The organization is responsible for maintaining accurate contact information for these communications.",
        "Consent to receive marketing communications is not required for DM3Oi to deliver service, security, account, administrative, or legal notices that are necessary to operate the service or manage the organization's relationship with DM3Oi.",
      ],
    },
    {
      heading: "15. Disclaimer of Warranties",
      paragraphs: [
        "To the maximum extent permitted by applicable law, DM3Oi is provided on an \"as is\" and \"as available\" basis. Except for obligations expressly stated in these Terms or a separate written agreement, no express, implied, statutory, or other warranty is made, including warranties of merchantability, fitness for a particular purpose, noninfringement, accuracy, availability, or uninterrupted operation.",
      ],
    },
    {
      heading: "16. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by applicable law, DM3Oi and its operators will not be liable for indirect, incidental, special, exemplary, punitive, or consequential damages, or for lost profits, lost revenue, lost business opportunity, loss of goodwill, business interruption, or loss or corruption of data arising from or related to use of or inability to use the service.",
        "Any limitation of liability is subject to applicable law and does not exclude liability that cannot lawfully be limited or excluded.",
      ],
    },
    {
      heading: "17. Indemnification",
      paragraphs: [
        "To the extent permitted by applicable law, the organization will defend and indemnify DM3Oi and the service provider against a third-party claim to the extent arising from Customer Data or other content supplied by the organization that is unlawful or infringes that third party's rights, or from the organization's material violation of the acceptable-use obligations in Section 5.",
        "This obligation is limited to claims caused by the organization-provided content or material misuse and does not apply to the extent a claim results from DM3Oi's unauthorized modification or use of that content or from DM3Oi's own acts. DM3Oi must provide reasonable notice of the claim and reasonable cooperation, and the organization may not agree to a settlement that admits liability or imposes nonmonetary obligations on DM3Oi without consent.",
      ],
    },
    {
      heading: "18. Suspension and Termination",
      paragraphs: [
        "Access may be suspended or terminated for a material violation of these Terms, unlawful use, a security risk, a threat to service integrity, inactive or ended organization access, or a legal requirement. When practical, DM3Oi may provide reasonable notice and an opportunity to remedy a remediable violation, except when urgent security, integrity, legal, or harm-prevention needs require prompt action.",
        "Following termination or loss of access, data handling, retention, deletion, export, or availability will be governed by applicable service practices, legal obligations, and any separate written agreement with the organization.",
        "Suspension or termination does not transfer ownership of the DM3Oi platform, software, source code, documentation, or other intellectual property to the organization or an authorized user.",
      ],
    },
    {
      heading: "19. Changes to These Terms",
      paragraphs: [
        "DM3Oi may publish updated Terms from time to time. Material updates may be communicated through the service or another established electronic channel, and an updated version may be made available before acceptance becomes mandatory.",
        "A future version may require explicit acceptance by an authorized representative of the organization. Publication and historical acceptance records may be retained as evidence rather than replaced merely because a later version is published. These Terms do not themselves implement any acceptance workflow.",
      ],
    },
    {
      heading: "20. General Contract Terms",
      paragraphs: [
        "These Terms, the Privacy Policy, and any applicable separately executed written agreement or order form constitute the agreement concerning the organization's use of the service and supersede prior or contemporaneous understandings about the same subject. If DM3Oi and the organization execute a separate written agreement governing the same service, that agreement controls to the extent of an express conflict.",
        "If a provision is held unenforceable, the remaining provisions remain effective and the unenforceable provision will be limited to the minimum extent necessary. A failure to enforce a provision is not a waiver of the right to enforce it later.",
        "Neither party may assign these Terms except with the other party's written consent or in connection with a merger, reorganization, sale of substantially all relevant assets, or similar business-successor transaction in which the successor assumes the assigning party's obligations. Neither party is responsible for delay or failure caused by events outside its reasonable control, and section headings are for convenience and do not control interpretation.",
      ],
    },
    {
      heading: "21. Contact",
      paragraphs: [
        "Questions concerning these Terms may be submitted through the organization's established DM3Oi support or administrative contact channel.",
      ],
    },
  ],
} as const satisfies LegalDocumentDefinition;

export const privacyPolicy = {
  type: "PRIVACY_POLICY",
  title: "Privacy Policy",
  version: "1.1",
  effectiveDate: "2026-10-04",
  introduction: [
    "This Privacy Policy describes how information is processed in connection with DM3Oi Business Operations Intelligence.",
    "DM3Oi is designed primarily for organizations that use the service to manage operational work, cases, customers, tasks, service requests, communications, reporting, and related business information. The customer organization determines much of the information entered into the service and is responsible for its collection and use.",
  ],
  sections: [
    {
      heading: "1. Information Processed",
      paragraphs: [
        "DM3Oi may process account and profile information, organization information, customer and contact information, case and task data, service requests, questions and responses, communications, reports, authentication and security information, and technical and usage information generated through use of the service, including page visits, browser or device characteristics, referral information, and interaction evidence used to understand service usage and reliability.",
        "The specific information processed depends on how the customer organization configures and uses DM3Oi.",
      ],
    },
    {
      heading: "2. How Information Is Used",
      paragraphs: [
        "Information may be used to provide and operate DM3Oi; authenticate users; maintain organization accounts and permissions; manage cases, tasks, service requests, communications, and customer workflows; generate operational reports and intelligence; maintain audit and delivery records; secure and troubleshoot the service; prevent misuse; and improve service reliability and functionality.",
      ],
    },
    {
      heading: "3. Customer Organization Responsibilities",
      paragraphs: [
        "The customer organization is responsible for determining what Customer Data it collects and submits, whether that collection is appropriate and lawful, and whether notices, permissions, or consents are required from customers, contacts, employees, contractors, or other individuals.",
        "DM3Oi processes Customer Data on behalf of the customer organization as reasonably necessary to provide, maintain, secure, and support the service.",
      ],
    },
    {
      heading: "4. Service Providers",
      paragraphs: [
        "DM3Oi may use service providers for functions such as hosting, database services, authentication, storage, email delivery, monitoring, and other infrastructure required to operate the service. Information may be processed by those providers to the extent necessary to perform their services.",
      ],
    },
    {
      heading: "5. Disclosure of Information",
      paragraphs: [
        "Information may be disclosed when directed or authorized by the customer organization, when necessary to provide or secure the service, to service providers acting on behalf of DM3Oi, to investigate misuse or protect rights and safety, or when required by applicable law or valid legal process.",
        "DM3Oi does not authorize service providers to use Customer Data for unrelated purposes merely because they process it to support the service.",
      ],
    },
    {
      heading: "6. Data Security",
      paragraphs: [
        "DM3Oi uses administrative, technical, and operational measures designed to protect information against unauthorized access, alteration, disclosure, or destruction. No internet-connected or hosted system can guarantee absolute security.",
        "Customer organizations and authorized users are responsible for protecting their devices, authentication methods, account access, and credentials.",
      ],
    },
    {
      heading: "7. Data Retention",
      paragraphs: [
        "Information may be retained for as long as reasonably necessary to provide the service, maintain business and audit records, comply with legal obligations, resolve disputes, enforce agreements, preserve security records, and support legitimate operational requirements.",
        "Retention periods may differ by information type and by the customer organization's service status or contractual requirements.",
      ],
    },
    {
      heading: "8. Operational and Audit Records",
      paragraphs: [
        "DM3Oi may maintain records relating to organization activity, account access, workflow events, communications, security events, and administrative actions as necessary to operate, secure, audit, and support the service.",
        "Certain operational and audit records may be retained as durable historical evidence even after related workflow or account information changes.",
      ],
    },
    {
      heading: "9. Access and Correction",
      paragraphs: [
        "Authorized users may be able to review or update certain account and organization information through DM3Oi. Requests concerning Customer Data generally should be directed to the customer organization that controls that information.",
        "Requests concerning information maintained directly by DM3Oi may be handled as required by applicable law and after appropriate identity or authority verification.",
      ],
    },
    {
      heading: "10. Product Measurement and De-identified Information",
      paragraphs: [
        "DM3Oi may analyze usage, workflow, operational, and technical information to evaluate service performance, identify patterns, improve functionality and reliability, and understand how the service performs in real-world organizational use.",
        "Aggregated or de-identified information may be used for product analysis, benchmarking, research, service improvement, and public descriptions of DM3Oi performance or results when the information does not reasonably identify a customer organization, customer, or individual user.",
        "Identifiable Customer Data, customer organization names, testimonials, and organization-specific results are not used for public marketing without separate authorization.",
      ],
    },
    {
      heading: "11. Changes to This Policy",
      paragraphs: [
        "DM3Oi may update this Privacy Policy as the service, legal requirements, or data practices change. The service may identify a new policy version when a new version is published.",
      ],
    },
    {
      heading: "12. Contact",
      paragraphs: [
        "Privacy questions may be submitted through the organization's established DM3Oi support or administrative contact channel.",
      ],
    },
  ],
} as const satisfies LegalDocumentDefinition;

export const fallbackLegalDocuments = {
  TERMS_OF_SERVICE: termsOfService,
  PRIVACY_POLICY: privacyPolicy,
} as const satisfies Record<LegalDocumentKey, LegalDocumentDefinition>;

const legalTextIsValid = (value: unknown, maxLength: number) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maxLength &&
  !/<[^>]*>/.test(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
) => Object.keys(value).every((key) => keys.includes(key));

export function isLegalDocumentKey(value: unknown): value is LegalDocumentKey {
  return legalDocumentKeys.includes(value as LegalDocumentKey);
}

export function isLegalDocumentVersion(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(value);
}

export function isLegalDocumentEffectiveDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

export function legalDocumentContent(
  document: LegalDocumentDefinition,
): LegalDocumentContent {
  return {
    type: document.type,
    title: document.title,
    introduction: [...document.introduction],
    sections: document.sections.map((section) => ({
      heading: section.heading,
      paragraphs: [...section.paragraphs],
    })),
  };
}

export function parseLegalDocumentContent(
  expectedKey: LegalDocumentKey,
  value: unknown,
): LegalDocumentContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const content = value as Record<string, unknown>;
  if (
    !hasOnlyKeys(content, ["type", "title", "introduction", "sections"]) ||
    content.type !== expectedKey ||
    !legalTextIsValid(content.title, 160) ||
    !Array.isArray(content.introduction) ||
    content.introduction.length < 1 ||
    content.introduction.length > 12 ||
    !content.introduction.every((item) => legalTextIsValid(item, 4000)) ||
    !Array.isArray(content.sections) ||
    content.sections.length < 1 ||
    content.sections.length > 30
  ) {
    return null;
  }

  const sections: LegalDocumentSection[] = [];
  for (const valueSection of content.sections) {
    if (
      !valueSection ||
      typeof valueSection !== "object" ||
      Array.isArray(valueSection)
    ) {
      return null;
    }

    const section = valueSection as Record<string, unknown>;
    if (
      !hasOnlyKeys(section, ["heading", "paragraphs"]) ||
      !legalTextIsValid(section.heading, 200) ||
      !Array.isArray(section.paragraphs) ||
      section.paragraphs.length < 1 ||
      section.paragraphs.length > 20 ||
      !section.paragraphs.every((item) => legalTextIsValid(item, 4000))
    ) {
      return null;
    }

    sections.push({
      heading: section.heading as string,
      paragraphs: [...(section.paragraphs as string[])],
    });
  }

  return {
    type: expectedKey,
    title: content.title as string,
    introduction: [...(content.introduction as string[])],
    sections,
  };
}

export function withLegalPublicationMetadata(
  content: LegalDocumentContent,
  version: string,
  effectiveDate: string,
): LegalDocumentDefinition {
  return {
    ...content,
    version,
    effectiveDate,
  };
}

export function getFallbackLegalDocument(documentKey: LegalDocumentKey) {
  return fallbackLegalDocuments[documentKey];
}
