export default function SecretsPage({ params }: { params: { id: string } }) {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Secrets — {params.id}</h1>
      <p className="mt-2 text-gray-500">Secret keys and edit forms go here. Values are never shown.</p>
    </main>
  );
}
