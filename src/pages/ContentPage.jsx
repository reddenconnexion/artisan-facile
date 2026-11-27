import { Fragment } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { PUBLIC_PAGE_LINKS, getPublicPage, pagePath, parseInline } from '../content/publicPages';
import { usePageMeta } from '../hooks/usePageMeta';

// Rendu des pages publiques de contenu (src/content/publicPages.js) pour les
// humains. La version lue par les robots est pré-rendue en HTML à la
// construction (src/content/prerender.js) à partir des mêmes données.

const Inline = ({ text }) => parseInline(text).map((seg, i) => {
    if (seg.type === 'strong') return <strong key={i} className="font-semibold text-gray-900">{seg.text}</strong>;
    if (seg.type === 'link') {
        const cls = 'text-blue-600 underline underline-offset-2 hover:text-blue-800';
        return seg.href.startsWith('/')
            ? <Link key={i} to={seg.href} className={cls}>{seg.text}</Link>
            : <a key={i} href={seg.href} className={cls}>{seg.text}</a>;
    }
    return <Fragment key={i}>{seg.text}</Fragment>;
});

const Paragraphs = ({ items }) => (items || []).map((p, i) => (
    <p key={i} className="text-gray-700 leading-relaxed mb-4"><Inline text={p} /></p>
));

const Bullets = ({ items }) => (items && items.length ? (
    <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-4">
        {items.map((b, i) => <li key={i}><Inline text={b} /></li>)}
    </ul>
) : null);

const Section = ({ section, level = 2 }) => {
    const Heading = level === 2 ? 'h2' : 'h3';
    const headingCls = level === 2
        ? 'text-2xl font-extrabold text-gray-900 mt-10 mb-4'
        : 'text-xl font-bold text-gray-900 mt-6 mb-2';
    return (
        <>
            {section.heading && <Heading className={headingCls}>{section.heading}</Heading>}
            <Paragraphs items={section.paragraphs} />
            <Bullets items={section.bullets} />
            {(section.sub || []).map((s, i) => <Section key={i} section={s} level={3} />)}
            <Paragraphs items={section.after} />
        </>
    );
};

const ContentPage = ({ slug }) => {
    const page = getPublicPage(slug);
    usePageMeta(page ? { title: page.title, description: page.description, path: pagePath(page) } : null);
    if (!page) return <Navigate to="/" replace />;

    const relatedPages = (page.related || []).map(getPublicPage).filter(Boolean);

    return (
        <div className="min-h-screen bg-white text-gray-800">
            <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <img src="/logo-bleu.svg" alt="Logo Artisan Facile" className="w-8 h-8 rounded-md" />
                        <span className="text-2xl font-bold text-blue-600">Artisan Facile</span>
                    </Link>
                    <nav aria-label="Compte" className="flex items-center gap-4 text-sm font-medium">
                        <Link to="/login" className="text-gray-600 hover:text-blue-600 transition-colors">Se connecter</Link>
                        <Link to="/register" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">S'inscrire</Link>
                    </nav>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <nav aria-label="Fil d'Ariane" className="text-sm text-gray-500 mb-6">
                    <Link to="/" className="inline-flex items-center gap-1 hover:text-blue-600"><ArrowLeft className="w-3.5 h-3.5" /> Accueil</Link>
                    <span className="mx-2">›</span>
                    <span>{page.kicker}</span>
                </nav>
                <article>
                    <p className="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">{page.kicker}</p>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-5">{page.h1}</h1>
                    <p className="text-lg text-gray-600 leading-relaxed mb-8"><Inline text={page.lead} /></p>

                    {page.sections.map((s, i) => <Section key={i} section={s} />)}

                    {page.faq && page.faq.length > 0 && (
                        <>
                            <h2 className="text-2xl font-extrabold text-gray-900 mt-10 mb-4">Questions fréquentes</h2>
                            <dl className="space-y-5">
                                {page.faq.map(({ q, a }) => (
                                    <div key={q}>
                                        <dt className="font-semibold text-gray-900 mb-1">{q}</dt>
                                        <dd className="text-gray-700 leading-relaxed"><Inline text={a} /></dd>
                                    </div>
                                ))}
                            </dl>
                        </>
                    )}

                    {relatedPages.length > 0 && (
                        <>
                            <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">À lire aussi</h2>
                            <ul className="space-y-1">
                                {relatedPages.map((p) => (
                                    <li key={p.slug}>
                                        <Link to={pagePath(p)} className="text-blue-600 underline underline-offset-2 hover:text-blue-800">{p.h1}</Link>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <aside className="mt-12 rounded-2xl bg-blue-600 text-white p-8">
                        <h2 className="text-2xl font-extrabold mb-2">{page.cta.title}</h2>
                        <p className="text-blue-100 mb-5">{page.cta.text}</p>
                        <Link to={page.cta.href} className="inline-flex items-center gap-2 bg-white text-blue-700 font-bold px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors">
                            {page.cta.button}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </aside>
                    <p className="text-xs text-gray-400 mt-8">Mis à jour le {page.updated}.</p>
                </article>
            </main>

            <footer className="bg-gray-900 text-gray-400 py-12 mt-12">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between gap-6 text-sm">
                    <div>
                        <p className="text-white font-bold text-lg">Artisan Facile</p>
                        <p className="mt-2 max-w-xs">Le logiciel de gestion gratuit des artisans qui se lancent : devis, factures, agenda, clients.</p>
                    </div>
                    <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 gap-y-2 max-w-xl">
                        <Link to="/" className="hover:text-white transition-colors">Accueil</Link>
                        {PUBLIC_PAGE_LINKS.map((l) => (
                            <Link key={l.href} to={l.href} className="hover:text-white transition-colors">{l.label}</Link>
                        ))}
                        <Link to="/mentions-legales" className="hover:text-white transition-colors">Mentions légales</Link>
                        <Link to="/politique-confidentialite" className="hover:text-white transition-colors">Confidentialité</Link>
                        <a href="mailto:contact@artisanfacile.fr" className="hover:text-white transition-colors">Contact</a>
                    </nav>
                </div>
            </footer>
        </div>
    );
};

export default ContentPage;
