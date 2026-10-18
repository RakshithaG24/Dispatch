import { ReactNode } from "react";
import { site } from "../config/site";
import { Layout } from "./Layout";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <Layout>
      <article className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {site.legalUpdated}</p>
        <div className="mt-8 space-y-8">
          {sections.map((s, i) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold">
                {i + 1}. {s.heading}
              </h2>
              <div className="mt-2 space-y-3 leading-relaxed text-ink/90">{s.body}</div>
            </section>
          ))}
        </div>
      </article>
    </Layout>
  );
}
