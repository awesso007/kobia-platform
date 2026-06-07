"use client";
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Error on segments page</h1>
      <pre className="mt-4 whitespace-pre-wrap text-xs">{error.message}</pre>
      <pre className="mt-2 text-xs">digest: {error.digest}</pre>
      <pre className="mt-2 whitespace-pre-wrap text-xs">{error.stack}</pre>
    </div>
  );
}
