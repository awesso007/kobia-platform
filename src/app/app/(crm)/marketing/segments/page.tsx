/*
 * DIAGNOSTIC version - print the actual error
 */
import { listSegments } from "../queries";

export const dynamic = "force-dynamic";

export default async function SegmentsPage() {
  let result: string;
  try {
    const rows = await listSegments();
    result = `OK: ${rows.length} segments. First: ${JSON.stringify(rows[0] ?? null)}`;
  } catch (err) {
    const e = err as Error;
    result = `ERROR: ${e.name}: ${e.message}\nStack:\n${e.stack}`;
  }
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Segments diagnostic</h1>
      <pre className="mt-4 whitespace-pre-wrap text-xs">{result}</pre>
    </div>
  );
}
