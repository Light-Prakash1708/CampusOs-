export default function ToolsLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading tools">
      <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface-sunken" />
        ))}
      </div>
      <div className="h-36 animate-pulse rounded-2xl bg-surface-sunken" />
    </div>
  );
}
