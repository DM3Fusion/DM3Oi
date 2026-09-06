import Link from "next/link";
export default function NotFound(){return <section className="panel empty"><span className="empty-icon">404</span><h1>Page not found</h1><p>The requested page could not be found.</p><Link className="primary-button" href="/">Return to dashboard</Link></section>}
