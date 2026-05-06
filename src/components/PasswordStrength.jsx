import React, { useMemo } from 'react';

const computeScore = (password) => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(score, 4);
};

const LEVELS = [
    { label: 'Très faible', color: 'bg-red-500', text: 'text-red-600' },
    { label: 'Faible', color: 'bg-orange-500', text: 'text-orange-600' },
    { label: 'Correct', color: 'bg-yellow-500', text: 'text-yellow-600' },
    { label: 'Bon', color: 'bg-lime-500', text: 'text-lime-600' },
    { label: 'Excellent', color: 'bg-emerald-600', text: 'text-emerald-600' },
];

const PasswordStrength = ({ password = '' }) => {
    const score = useMemo(() => computeScore(password), [password]);

    if (!password) return null;

    const level = LEVELS[score];
    const segments = 4;
    const filled = Math.max(1, score);

    return (
        <div className="mt-2" aria-live="polite">
            <div className="flex gap-1">
                {Array.from({ length: segments }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < filled ? level.color : 'bg-gray-200'
                        }`}
                    />
                ))}
            </div>
            <p className={`mt-1.5 text-xs font-medium ${level.text}`}>
                Sécurité : {level.label}
                {score < 3 && (
                    <span className="ml-1 text-gray-400 font-normal">
                        — ajoutez majuscules, chiffres ou symboles
                    </span>
                )}
            </p>
        </div>
    );
};

export default PasswordStrength;
