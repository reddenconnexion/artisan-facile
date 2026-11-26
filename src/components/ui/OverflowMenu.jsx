import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, MoreVertical } from 'lucide-react';

/**
 * Bouton « ⋯ » qui range les actions secondaires d'un écran ou d'une ligne,
 * pour ne laisser à l'écran que l'action principale.
 *
 * Le menu s'affiche par-dessus la page (portail), sous le bouton ou au-dessus
 * s'il manque de place en bas : il n'est jamais coupé par une liste ou une
 * carte. Il se ferme au toucher à côté, sur Échap, au défilement ou après
 * avoir choisi une action. Clavier : ↑ ↓ Début Fin pour parcourir.
 *
 * Usage :
 *   <OverflowMenu items={[
 *     { label: 'Exporter en CSV', icon: Download, onClick: exporter },
 *     { label: 'Itinéraire', icon: Navigation, href: url, external: true },
 *     { divider: true },
 *     { label: 'Supprimer', icon: Trash2, onClick: supprimer, danger: true },
 *   ]} />
 *
 * Une entrée : { label, icon, onClick, href, external, description, danger,
 * disabled, hidden, title }. `{ divider: true }` sépare deux groupes. Les
 * entrées `hidden` ou falsy sont ignorées ; sans entrée visible, rien n'est
 * affiché.
 *
 * `variant` : `outline` (en-tête d'écran, bordure) · `ghost` (ligne de liste,
 * discret). `size` : `sm` (barre de petits boutons) · `md` (défaut) · `lg`
 * (à côté de gros boutons arrondis).
 * `orientation` : `horizontal` (⋯, défaut) · `vertical` (⋮). `badge` : pastille
 * sur le bouton quand une action rangée mérite l'attention (texte ou `true`).
 *
 * Menus sur mesure : `children` (fonction `(close) => contenu`) remplace
 * `items`, `trigger` remplace l'icône ⋯ (avec `size="auto"`), et `open` /
 * `onOpenChange` permettent de piloter l'ouverture depuis le parent.
 */
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;
// Ce qui se parcourt au clavier : les entrées du menu, et les boutons et liens
// d'un contenu sur mesure.
const FOCUSABLE = '[role="menuitem"]:not([disabled]), button:not([disabled]), a[href]';

const TRIGGER_VARIANTS = {
    outline: 'border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
    ghost: 'rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800',
};

const TRIGGER_SIZES = {
    outline: { sm: 'w-8 h-8 rounded-lg', md: 'w-10 h-10 rounded-lg', lg: 'w-12 h-12 rounded-2xl', auto: 'h-10 px-3 gap-1 rounded-lg' },
    ghost: { sm: 'p-1.5', md: 'p-2', lg: 'p-2.5', auto: 'px-2 py-1.5 gap-1' },
};

const ITEM_BASE = 'tap-target w-full flex items-start gap-3 px-4 py-2.5 text-sm text-left transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed';

const OverflowMenu = ({
    items = [],
    children = null,
    trigger = null,
    open: openProp,
    onOpenChange,
    label = "Plus d'actions",
    title,
    variant = 'outline',
    size = 'md',
    orientation = 'horizontal',
    badge = null,
    width = 'w-64',
    className = '',
    triggerClassName = '',
    iconClassName = 'w-5 h-5',
}) => {
    const [internalOpen, setInternalOpen] = useState(false);
    const controlled = openProp !== undefined;
    const open = controlled ? !!openProp : internalOpen;
    const [position, setPosition] = useState(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const menuId = useId();

    const visibleItems = items.filter((item) => item && !item.hidden);
    // Pas de séparateur en tête, en fin ni en double.
    const entries = visibleItems.filter((item, i, arr) => {
        if (!item.divider) return true;
        return i > 0 && i < arr.length - 1 && !arr[i - 1].divider;
    });
    const hasActions = children != null || entries.some((item) => !item.divider);

    const setOpen = useCallback((next) => {
        if (!controlled) setInternalOpen(next);
        onOpenChange?.(next);
    }, [controlled, onOpenChange]);

    const close = useCallback((restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    }, [setOpen]);
    // Fermeture donnée au contenu sur mesure (les actions qu'il porte).
    const closeFromContent = useCallback(() => setOpen(false), [setOpen]);

    // Place le menu sous le bouton, aligné sur son bord droit ; au-dessus s'il
    // manque de place en bas. Il reste toujours dans l'écran : décalé vers la
    // droite s'il déborderait à gauche, et limité en hauteur (il défile alors
    // à l'intérieur) s'il est plus haut que la place disponible.
    useLayoutEffect(() => {
        if (!open) return;
        const triggerEl = triggerRef.current;
        const menu = menuRef.current;
        if (!triggerEl || !menu) return;
        const rect = triggerEl.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = window.innerHeight;
        // Hauteur naturelle du contenu (bordures comprises), même si une
        // ouverture précédente l'a limitée.
        const menuHeight = menu.scrollHeight + (menu.offsetHeight - menu.clientHeight);
        const menuWidth = Math.min(menu.offsetWidth, viewportWidth - 2 * VIEWPORT_MARGIN);
        const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
        const openUp = menuHeight > spaceBelow && spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, openUp ? spaceAbove : spaceBelow);
        const height = Math.min(menuHeight, maxHeight);
        const left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(rect.right - menuWidth, viewportWidth - menuWidth - VIEWPORT_MARGIN),
        );
        const top = openUp
            ? Math.max(VIEWPORT_MARGIN, rect.top - MENU_GAP - height)
            : Math.min(rect.bottom + MENU_GAP, viewportHeight - VIEWPORT_MARGIN - height);
        setPosition({ top, left, maxHeight });
    }, [open]);

    // Focus sur la première action dès que le menu est placé.
    useEffect(() => {
        if (!open || !position) return;
        const first = menuRef.current?.querySelector(FOCUSABLE);
        first?.focus({ preventScroll: true });
    }, [open, position]);

    // Le menu suit le bouton : on le ferme si la page défile ou change de taille.
    useEffect(() => {
        if (!open) return undefined;
        const onScroll = (e) => {
            if (menuRef.current?.contains(e.target)) return;
            close();
        };
        const onResize = () => close();
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onResize);
        };
    }, [open, close]);

    if (!hasActions) return null;

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(true);
            return;
        }
        if (e.key === 'Tab') {
            close();
            return;
        }
        const nodes = Array.from(menuRef.current?.querySelectorAll(FOCUSABLE) || []);
        if (nodes.length === 0) return;
        const index = nodes.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            nodes[(index + 1) % nodes.length].focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            nodes[(index - 1 + nodes.length) % nodes.length].focus();
        } else if (e.key === 'Home') {
            e.preventDefault();
            nodes[0].focus();
        } else if (e.key === 'End') {
            e.preventDefault();
            nodes[nodes.length - 1].focus();
        }
    };

    const Icon = orientation === 'vertical' ? MoreVertical : MoreHorizontal;

    const renderItem = (item, i) => {
        if (item.divider) {
            return <div key={`divider-${i}`} role="separator" className="my-1 border-t border-gray-100 dark:border-gray-800" />;
        }
        const ItemIcon = item.icon;
        const tone = item.danger
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:bg-gray-50 dark:focus:bg-gray-800';
        const content = (
            <>
                {ItemIcon && (
                    <ItemIcon
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${item.danger ? '' : (item.iconClassName || 'text-gray-400 dark:text-gray-500')}`}
                        aria-hidden="true"
                    />
                )}
                <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.label}</span>
                    {item.description && (
                        <span className="block text-xs font-normal text-gray-400 dark:text-gray-500 mt-0.5">{item.description}</span>
                    )}
                </span>
            </>
        );
        const key = item.key || item.label || i;

        if (item.href && !item.disabled) {
            return (
                <a
                    key={key}
                    role="menuitem"
                    tabIndex={-1}
                    href={item.href}
                    title={item.title}
                    {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    onClick={() => {
                        item.onClick?.();
                        close();
                    }}
                    className={`${ITEM_BASE} ${tone}`}
                >
                    {content}
                </a>
            );
        }

        return (
            <button
                key={key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                    close();
                    item.onClick?.();
                }}
                className={`${ITEM_BASE} ${tone}`}
            >
                {content}
            </button>
        );
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={(e) => {
                    // Les menus de ligne vivent souvent dans une ligne cliquable.
                    e.stopPropagation();
                    if (open) close();
                    else setOpen(true);
                }}
                aria-label={label}
                title={title ?? label}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                className={`tap-target relative inline-flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ios ${TRIGGER_VARIANTS[variant] || TRIGGER_VARIANTS.outline} ${(TRIGGER_SIZES[variant] || TRIGGER_SIZES.outline)[size] || ''} ${triggerClassName} ${className}`}
            >
                {trigger ?? <Icon className={iconClassName} aria-hidden="true" />}
                {badge && (
                    <span
                        className={`absolute -top-1 -right-1 rounded-full bg-orange-500 text-white font-bold leading-none ring-2 ring-white dark:ring-gray-900 ${badge === true ? 'w-2.5 h-2.5' : 'min-w-[16px] h-4 px-1 text-[10px] flex items-center justify-center'}`}
                        aria-hidden="true"
                    >
                        {badge === true ? null : badge}
                    </span>
                )}
            </button>

            {open && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[79]"
                        aria-hidden="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            close();
                        }}
                    />
                    <div
                        ref={menuRef}
                        id={menuId}
                        role="menu"
                        aria-label={label}
                        onKeyDown={handleKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        style={position
                            ? { top: position.top, left: position.left, maxHeight: position.maxHeight }
                            : { top: 0, left: 0, visibility: 'hidden' }}
                        className={`fixed z-[80] ${width} max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain py-1 text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-lg`}
                    >
                        {children != null
                            ? (typeof children === 'function' ? children(closeFromContent) : children)
                            : entries.map(renderItem)}
                    </div>
                </>,
                document.body,
            )}
        </>
    );
};

export default OverflowMenu;
