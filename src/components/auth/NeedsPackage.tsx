import { Package } from "lucide-react";
import Link from "next/link";
import { PageHead, Panel } from "@/components/ui/Panel";
import { featureLabel, PACKAGE_FEATURES, type PackageFeature } from "@/lib/packages";

/** Shown in place of a section the company's care package doesn't include. */
export function NeedsPackage({ title, feature, canSubscribe }: { title: string; feature: PackageFeature; canSubscribe: boolean }) {
  const detail = PACKAGE_FEATURES.find((f) => f.key === feature)?.detail;
  return (
    <>
      <PageHead title={title} icon={Package}>
        {featureLabel(feature)} comes with a care package.
      </PageHead>
      <Panel>
        <p style={{ marginTop: 0 }}>{detail}</p>
        {canSubscribe ? (
          <Link href="/company/package" className="btn primary">
            See care packages
          </Link>
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
            Ask your company admin to subscribe to a package that includes it. Until then, reply to clients from the Chat agent inbox.
          </p>
        )}
      </Panel>
    </>
  );
}
