/* eslint-disable @next/next/no-img-element */
export function Logo({ onDark = false, height = 36 }: { onDark?: boolean; height?: number }) {
  if (onDark) return <img src="/brand/zimara-lockup-light.png" alt="زيمارا | ZIMARA" style={{ height, width: "auto" }} />;
  return (
    <picture>
      <source srcSet="/brand/zimara-lockup-light.png" media="(prefers-color-scheme: dark)" />
      <img src="/brand/zimara-lockup.png" alt="زيمارا | ZIMARA" style={{ height, width: "auto" }} />
    </picture>
  );
}
