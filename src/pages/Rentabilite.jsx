import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { fetchWorksites } from '../utils/worksites';
import { useChantierMargins } from '../hooks/useChantierMargins';
import {
    chantierProfitRows, clientProfitRows, profitTotals, sortProfitRows, PROFIT_SORTS,
} from '../utils/profitability';
import { formatCurrencyRounded } from '../utils/format';
import { Card, PageHeader, SegmentedControl, EmptyState, LoadingState } from '../components/ui';

const EMPTY = [];

const LEVEL_STYLE = {
    below: 'text-red-600 dark:text-red-400',
    watch: 'text-amber-600 dark:text-amber-400',
    ok: 'text-emerald-600 dark:text-emerald-400',
};

const pct = (m) => `${Math.round(m * 100)} %`;

const Stat = ({ label, value, tone }) => (
    <Card className="p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`text-xl font-bold mt-1 ${tone || 'text-gray-900 dark:text-white'}`}>{value}</p>
    </Card>
);

const Rentabilite = () => {
    const [worksites, setWorksites] = useState(EMPTY);
    const [amendments, setAmendments] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('chantiers');
    const [sort, setSort] = useState('profit');

    useEffect(() => {
        let cancelled = false;
        fetchWorksites()
            .then((d) => {
                if (cancelled) return;
                setWorksites(d.worksites);
                setAmendments(d.amendments);
            })
            .catch((err) => {
                console.error('Rentabilité:', err);
                toast.error('Erreur chargement de la rentabilité');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const { reports, threshold } = useChantierMargins(worksites, amendments);

    const { chantiers, clients, missing, totals } = useMemo(() => {
        const { rows, missing: miss } = chantierProfitRows(worksites, reports);
        return {
            chantiers: sortProfitRows(rows, sort),
            clients: sortProfitRows(clientProfitRows(rows), sort),
            missing: miss,
            totals: profitTotals(rows),
        };
    }, [worksites, reports, sort]);

    if (loading) return <LoadingState />;

    const list = view === 'chantiers' ? chantiers : clients;

    return (
        <div className="space-y-5 pb-24">
            <PageHeader
                title="Rentabilité"
                subtitle={`Marge réelle des chantiers signés · alerte sous ${threshold} %`}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Chiffre d'affaires HT" value={formatCurrencyRounded(totals.revenue)} />
                <Stat label="Coûts réels" value={formatCurrencyRounded(totals.cost)} />
                <Stat label="Bénéfice" value={formatCurrencyRounded(totals.profit)} />
                <Stat
                    label="Marge moyenne"
                    value={totals.margin == null ? '—' : pct(totals.margin)}
                    tone={totals.margin == null ? undefined : LEVEL_STYLE[totals.margin * 100 < threshold ? 'below' : 'ok']}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <SegmentedControl
                    value={view}
                    onChange={setView}
                    options={[{ id: 'chantiers', label: 'Par chantier' }, { id: 'clients', label: 'Par client' }]}
                />
                <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Trier par"
                    className="ml-auto text-sm rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#1c1c1e] px-3 py-2 min-h-[44px]"
                >
                    {PROFIT_SORTS.map((s) => <option key={s.id} value={s.id}>Trier : {s.label}</option>)}
                </select>
            </div>

            {list.length === 0 ? (
                <EmptyState
                    icon={TrendingUp}
                    title="Pas encore de marge réelle"
                    description="Saisissez vos achats et pointez vos heures sur un chantier signé : la rentabilité apparaît ici."
                />
            ) : (
                <Card className="divide-y divide-gray-100 dark:divide-white/10 overflow-hidden">
                    {list.map((r) => {
                        const key = view === 'chantiers' ? r.id : r.key;
                        const level = view === 'chantiers' ? r.level : (r.margin * 100 < threshold ? 'below' : 'ok');
                        const to = view === 'chantiers' ? `/app/devis/${r.id}` : (r.clientId ? `/app/clients/${r.clientId}` : null);
                        const Row = to ? Link : 'div';
                        return (
                            <Row key={key} {...(to ? { to } : {})} className="flex items-center gap-3 px-4 py-3 min-h-[56px] hover:bg-black/5 dark:hover:bg-white/5">
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">
                                        {view === 'chantiers' ? r.title : r.clientName}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {view === 'chantiers' ? r.clientName : `${r.chantiers} chantier${r.chantiers > 1 ? 's' : ''}`}
                                        {' · '}CA {formatCurrencyRounded(r.revenue)} · coûts {formatCurrencyRounded(r.cost)}
                                    </p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="font-semibold">{formatCurrencyRounded(r.profit)}</p>
                                    <p className={`text-sm font-bold ${LEVEL_STYLE[level] || ''}`}>
                                        {level === 'below' && <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />}
                                        {pct(r.margin)}
                                    </p>
                                </div>
                            </Row>
                        );
                    })}
                </Card>
            )}

            {missing.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {missing.length} chantier{missing.length > 1 ? 's' : ''} sans CA exploitable, non comptabilisé{missing.length > 1 ? 's' : ''}.
                </p>
            )}
        </div>
    );
};

export default Rentabilite;
