export default function DeploymentsPage({ params }: { params: { id: string } }) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Deployments — {params.id}</h1>
      <p className="mt-2 text-gray-500">Deployment history and rollback controls go here.</p>
    </main>
  );
}
