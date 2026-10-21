// PageBanner: the compact green strip every page opens with.
//
// Same watercolor strip and date pill as the dashboards' banner, carrying the
// page's own title and a one-line scope instead of the signed-in person's name.
// On the document pages (syllabus, TOS) it is also marked `no-print` by its
// callers, so exports and browser printing never pick it up.
interface PageBannerProps {
  title: string
  sub: string
}

function PageBanner({ title, sub }: PageBannerProps) {
  const now = new Date()
  return (
    <section className="dashbanner dashbanner--page no-print" aria-label={title}>
      <div className="dashbanner__info">
        <h1 className="dashbanner__title">{title}</h1>
        <p className="dashbanner__desc">{sub}</p>
      </div>
      <time className="dashbanner__date" dateTime={now.toISOString().split('T')[0]}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        <span>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </time>
    </section>
  )
}

export default PageBanner
