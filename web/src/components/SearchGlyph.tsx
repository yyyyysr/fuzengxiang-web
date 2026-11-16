export function SearchGlyph({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={`search-glyph ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <circle className="sg-lens" cx="10.3" cy="10.3" r="6.3" />
      <path className="sg-glint" d="M6.8 9.4a3.8 3.8 0 0 1 2.5-2.6" />
      <path className="sg-handle" d="M15.1 15.1 19.6 19.6" />
    </svg>
  );
}
