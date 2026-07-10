import React from 'react';
import { Check, Trophy } from 'lucide-react';
import { useAchievements } from '../hooks/useAchievements';

// Carte « Jalons de maîtrise » du Profil : affichage seul (les toasts de
// déblocage sont gérés une seule fois dans Layout via useAchievements({notify:true})).
const AchievementsCard = () => {
    const { achievements } = useAchievements();

    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const total = achievements.length;
    const pct = total ? Math.round((unlockedCount / total) * 100) : 0;

    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <div className="flex items-center gap-2.5 mb-1">
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                        <Trophy className="w-5 h-5 text-amber-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Jalons de maîtrise</h3>
                    <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full text-amber-600 bg-amber-50 dark:bg-amber-900/30 tabular-nums">
                        {unlockedCount}/{total}
                    </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Des étapes franchies au fil de votre activité. Rien à faire : elles se débloquent toutes seules.
                </p>

                {/* Barre de progression globale */}
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-6">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
                        style={{ width: `${pct}%` }}
                    />
                </div>

                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {achievements.map(a => (
                        <li
                            key={a.id}
                            className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all ${
                                a.unlocked
                                    ? 'border-amber-100 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10'
                                    : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30'
                            }`}
                        >
                            <span
                                className={`text-xl leading-none transition-all ${a.unlocked ? '' : 'grayscale opacity-40'}`}
                                aria-hidden="true"
                            >
                                {a.emoji}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm font-medium truncate ${
                                    a.unlocked ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                    {a.label}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                    {a.unlocked ? a.description : `${a.current} / ${a.target}`}
                                </div>
                            </div>
                            {a.unlocked && (
                                <span className="shrink-0 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default AchievementsCard;
