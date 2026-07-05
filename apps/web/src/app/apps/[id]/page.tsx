export default function AppOverviewPage({ params }: { params: { id: string } }) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">App {params.id}</h1>
      <p className="mt-2 text-gray-500">Pods, recent deploys, and quick links go here.</p>
    </main>
  );
}
