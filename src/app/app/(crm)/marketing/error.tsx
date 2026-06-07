"use client";
export default function MarketingError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Marketing error</h1>
      <pre className="mt-4 whitespace-pre-wrap text-xs" style={{color:"red"}}>MSG: {error.message}</pre>
      <pre className="mt-2 text-xs">digest: {error.digest}</pre>
      <pre className="mt-2 whitespace-pre-wrap text-xs">{error.stack}</pre>
    </div>
  );
}
