/*
 * New Form page (Sprint 19). Renders the create form; on success the client
 * redirects to the builder.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PageHeader, Card, NewFormForm } from "../Forms2UI";

export const dynamic = "force-dynamic";

export default function NewFormPage() {
  return (
    <div className="p-6">
      <PageHeader title="New form" subtitle="Give your form a name to start building." />
      <div style={{ maxWidth: "560px" }}>
        <Card>
          <div className="p-4">
            <NewFormForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
