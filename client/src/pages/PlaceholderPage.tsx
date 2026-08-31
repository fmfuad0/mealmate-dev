export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section will be implemented in an upcoming phase.
      </p>
    </div>
  );
}
