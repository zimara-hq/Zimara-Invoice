export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="top no-print">
      <h1>{title}</h1>
      <span className="grow" />
      <div className="row">{children}</div>
    </header>
  );
}
