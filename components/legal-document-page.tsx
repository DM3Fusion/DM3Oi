import Link from "next/link";

import type { LegalDocumentDefinition } from "@/lib/legal-documents";

export function LegalDocumentPage({
  document,
}: {
  document: LegalDocumentDefinition;
}) {
  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <Link href="/" className="legal-document-brand">
            <strong>DM3Oi™</strong>
            <span>Business Operations Intelligence</span>
          </Link>

          <p className="eyebrow">Legal</p>
          <h1>{document.title}</h1>

          <p className="legal-document-version">
            Version {document.version}
            {" · "}
            Effective {document.effectiveDate}
          </p>
        </header>

        <div className="legal-document-body">
          {document.introduction.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}

          {document.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>

              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="legal-document-footer">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/login">DM3Oi Sign In</Link>
        </footer>
      </article>
    </main>
  );
}
