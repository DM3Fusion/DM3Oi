import Link from "next/link";
export default function CaseNotFound(){return <section className="panel empty"><span className="empty-icon">404</span><h1>Case not found</h1><p>The requested case does not exist in this workspace.</p><Link className="primary-button" href="/cases">Return to cases</Link></section>}
