export type LegalDocumentSection = {
  heading: string;
  paragraphs: readonly string[];
};

export type LegalDocumentDefinition = {
  type: "TERMS_OF_SERVICE" | "PRIVACY_POLICY";
  title: string;
  version: string;
  effectiveDate: string;
  introduction: readonly string[];
  sections: readonly LegalDocumentSection[];
};

export const termsOfService = {
  type: "TERMS_OF_SERVICE",
  title: "Terms of Service",
  version: "1.0",
  effectiveDate: "2026-09-22",
  introduction: [
    "These Terms of Service govern access to and use of DM3Oi Business Operations Intelligence by a customer organization and its authorized users.",
    "By accepting these Terms on behalf of an organization, the Business Owner represents that the Business Owner has authority to bind the organization to these Terms. The organization is responsible for use of DM3Oi by its authorized users.",
  ],
  sections: [
    {
      heading: "1. Service",
      paragraphs: [
        "DM3Oi provides hosted business operations, case management, task, service request, communication, reporting, and related workflow capabilities. Features may be changed, improved, suspended, or discontinued as the service evolves.",
        "DM3Oi is provided as a business workflow and information system. It does not replace professional, legal, financial, regulatory, accounting, safety, or other specialized advice or independent business judgment.",
      ],
    },
    {
      heading: "2. Organization Accounts and Authorized Users",
      paragraphs: [
        "The customer organization is responsible for determining who may access its account, assigning appropriate roles, maintaining accurate account information, and promptly removing access that is no longer authorized.",
        "Authorized users must use DM3Oi in accordance with these Terms, the organization's policies, and applicable law. The organization is responsible for activity performed through accounts and access credentials it authorizes.",
      ],
    },
    {
      heading: "3. Customer Data",
      paragraphs: [
        "Customer Data includes information, records, customer and contact information, cases, tasks, service requests, communications, responses, reports, files, and other content submitted to or created through DM3Oi for the organization.",
        "The organization is responsible for the accuracy, legality, appropriateness, and authorization of Customer Data. The organization represents that it has the rights, permissions, notices, and consents reasonably necessary to submit and use Customer Data through DM3Oi.",
        "The organization authorizes DM3Oi to host, process, transmit, reproduce, and otherwise use Customer Data as reasonably necessary to provide, maintain, secure, support, and improve the service, subject to the Privacy Policy and applicable law.",
      ],
    },
    {
      heading: "4. Acceptable Use and Security",
      paragraphs: [
        "Users may not use DM3Oi unlawfully; interfere with or disrupt the service; attempt unauthorized access; introduce malicious code; misuse another person's credentials; or use the service in a manner that compromises the security, availability, or integrity of DM3Oi or another customer's data.",
        "The organization is responsible for reasonable security of its devices, accounts, credentials, and authorized-user access. Suspected unauthorized access should be reported promptly.",
      ],
    },
    {
      heading: "5. License and Access",
      paragraphs: [
        "Access to organization features is subject to an applicable DM3Oi license and continued authorization to use the service.",
        "Access may be limited, suspended, or terminated when the applicable license or organization access is no longer active or when otherwise permitted under these Terms.",
      ],
    },
    {
      heading: "6. Service Availability and Changes",
      paragraphs: [
        "DM3Oi may experience maintenance, outages, network failures, provider interruptions, software defects, or other events that affect availability. Continuous or uninterrupted operation is not guaranteed.",
        "The organization is responsible for maintaining business procedures appropriate to its needs, including any independent records, backups, verification, or continuity measures it determines are necessary.",
      ],
    },
    {
      heading: "7. Reports, Outputs, and Business Reliance",
      paragraphs: [
        "Reports, workflow states, calculations, notifications, operational intelligence, and other system outputs depend on Customer Data, configuration, user actions, and available system information. The organization is responsible for reviewing outputs before relying on them for business, contractual, regulatory, safety, financial, or other material decisions.",
        "DM3Oi does not guarantee that Customer Data or system-generated outputs are complete, error-free, suitable for a particular purpose, or sufficient to satisfy any independent legal, contractual, regulatory, or professional requirement.",
      ],
    },
    {
      heading: "8. Data Preservation and Loss",
      paragraphs: [
        "DM3Oi uses reasonable measures intended to operate and protect the service, but no hosted system can guarantee against every loss, corruption, deletion, interruption, or unauthorized event.",
        "To the extent appropriate for its business, the organization is responsible for retaining independent copies of information or reports it considers critical and for reviewing exported or delivered materials for completeness.",
      ],
    },
    {
      heading: "9. Confidentiality and Privacy",
      paragraphs: [
        "DM3Oi will handle personal information and Customer Data as described in the Privacy Policy and will use reasonable measures designed to protect information under its control.",
        "The organization is responsible for determining whether its use of DM3Oi and the information it collects through the service requires additional notices, permissions, agreements, or safeguards.",
      ],
    },
    {
      heading: "10. Disclaimer of Warranties",
      paragraphs: [
        "To the maximum extent permitted by applicable law, DM3Oi is provided on an \"as is\" and \"as available\" basis. Except for obligations expressly stated in these Terms, no express, implied, statutory, or other warranty is made, including warranties of merchantability, fitness for a particular purpose, noninfringement, accuracy, availability, or uninterrupted operation.",
      ],
    },
    {
      heading: "11. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by applicable law, DM3Oi and its operators will not be liable for indirect, incidental, special, exemplary, punitive, or consequential damages, or for lost profits, lost revenue, lost business opportunity, loss of goodwill, business interruption, or loss or corruption of data arising from or related to use of or inability to use the service.",
        "Any limitation of liability is subject to applicable law and does not exclude liability that cannot lawfully be limited or excluded.",
      ],
    },
    {
      heading: "12. Suspension and Termination",
      paragraphs: [
        "Access may be suspended or terminated when a license expires, is suspended or canceled; for material misuse or security risk; or when required by law.",
        "Following termination or loss of access, data handling, retention, deletion, or availability will be governed by applicable service practices, legal obligations, and any separate written agreement with the organization.",
      ],
    },
    {
      heading: "13. Changes to These Terms",
      paragraphs: [
        "DM3Oi may publish updated Terms from time to time. An updated version may be made available before acceptance becomes mandatory.",
        "When DM3Oi implements versioned organization acceptance, acceptance records may be maintained as historical evidence rather than replaced merely because a later version is published.",
      ],
    },
    {
      heading: "14. Contact",
      paragraphs: [
        "Questions concerning these Terms may be submitted through the organization's established DM3Oi support or administrative contact channel.",
      ],
    },
  ],
} as const satisfies LegalDocumentDefinition;

export const privacyPolicy = {
  type: "PRIVACY_POLICY",
  title: "Privacy Policy",
  version: "1.0",
  effectiveDate: "2026-09-22",
  introduction: [
    "This Privacy Policy describes how information is processed in connection with DM3Oi Business Operations Intelligence.",
    "DM3Oi is designed primarily for organizations that use the service to manage operational work, cases, customers, tasks, service requests, communications, reporting, and related business information. The customer organization determines much of the information entered into the service and is responsible for its collection and use.",
  ],
  sections: [
    {
      heading: "1. Information Processed",
      paragraphs: [
        "DM3Oi may process account and profile information, organization information, customer and contact information, case and task data, service requests, questions and responses, communications, reports, authentication and security information, and technical information generated through use of the service.",
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
      heading: "10. Changes to This Policy",
      paragraphs: [
        "DM3Oi may update this Privacy Policy as the service, legal requirements, or data practices change. The service may identify a new policy version when a new version is published.",
      ],
    },
    {
      heading: "11. Contact",
      paragraphs: [
        "Privacy questions may be submitted through the organization's established DM3Oi support or administrative contact channel.",
      ],
    },
  ],
} as const satisfies LegalDocumentDefinition;
