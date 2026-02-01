import { useState, useEffect } from 'react';

/**
 * Hook pour retarder une valeur
 * Utile pour les recherches afin d'éviter trop de re-renders
 *
 * @param {any} value - La valeur à retarder
 * @param {number} delay - Le délai en millisecondes (défaut: 300ms)
 * @returns {any} - La valeur retardée
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 *
 * // Le filtrage ne se fait que 300ms après la dernière frappe
 * const filteredItems = items.filter(item =>
 *   item.name.includes(debouncedSearch)
 * );
 */
export function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Hook pour créer une fonction debounced
 *
 * @param {Function} callback - La fonction à retarder
 * @param {number} delay - Le délai en millisecondes
 * @returns {Function} - La fonction retardée
 */
export function useDebouncedCallback(callback, delay = 300) {
    const [timeoutId, setTimeoutId] = useState(null);

    const debouncedCallback = (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        const newTimeoutId = setTimeout(() => {
            callback(...args);
        }, delay);

        setTimeoutId(newTimeoutId);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [timeoutId]);

    return debouncedCallback;
}
