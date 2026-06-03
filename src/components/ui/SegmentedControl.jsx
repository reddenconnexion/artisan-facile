import React from 'react';

/**
 * Segmented control iOS (pilule active sur fond gris translucide).
 *
 * Usage :
 *   <SegmentedControl
 *     options={[{ id: 'a', label: 'A', icon: IconA }, …]}
 *     value={active}
 *     onChange={setActive}
 *   />
 */
const SegmentedControl = ({ options, value, onChange, className = '' }) => (
  <div
    role="tablist"
    className={`inline-flex items-center gap-1 p-1 bg-gray-200/70 dark:bg-white/10 rounded-xl overflow-x-auto max-w-full ${className}`}
  >
    {options.map((opt) => {
      const Icon = opt.icon;
      const isActive = value === opt.id;
      return (
        <button
          key={opt.id}
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(opt.id)}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium whitespace-nowrap rounded-lg transition-all ${
            isActive
              ? 'bg-white dark:bg-[#1c1c1e] text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          {Icon && <Icon className="w-4 h-4" />}
          {opt.label}
        </button>
      );
    })}
  </div>
);

export default SegmentedControl;
