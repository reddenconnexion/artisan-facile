import { useEffect } from 'react';
import { ROUTE_META, SITE_URL } from '../content/publicPages';

const setMeta = (selector, attr, value) => {
    const el = document.head.querySelector(selector);
    if (el && value != null) el.setAttribute(attr, value);
};

const apply = ({ title, description, path }) => {
    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    if (path) {
        const url = `${SITE_URL}${path === '/' ? '/' : path}`;
        setMeta('link[rel="canonical"]', 'href', url);
        setMeta('meta[property="og:url"]', 'content', url);
    }
};

/**
 * Titre, description et canonique de la page courante (pages publiques).
 * L'application étant une SPA, index.html porte les balises de l'accueil :
 * ce hook les met à jour à l'affichage et les restaure en quittant la page.
 * @param {{title:string, description:string, path?:string}} meta
 */
export const usePageMeta = (meta) => {
    const { title, description, path } = meta || {};
    useEffect(() => {
        if (!title) return undefined;
        apply({ title, description, path });
        return () => apply({ ...ROUTE_META['/'], path: '/' });
    }, [title, description, path]);
};

export default usePageMeta;
