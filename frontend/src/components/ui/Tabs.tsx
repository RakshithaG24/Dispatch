interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface TabsProps<K extends string> {
  tabs: Tab<K>[];
  active: K;
  onChange: (key: K) => void;
}

export function Tabs<K extends string>({ tabs, active, onChange }: TabsProps<K>) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-line">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`-mb-px border-b-2 py-3 text-sm font-medium transition-colors ${
              selected ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-2 font-mono text-xs text-muted">{tab.count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}
