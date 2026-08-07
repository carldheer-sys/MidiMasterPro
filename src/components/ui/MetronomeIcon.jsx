export function MetronomeIcon({ className, size = 20 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M8 2 L16 2 L19 21 L5 21 Z" />
      <line x1="12" y1="4" x2="10" y2="19" />
      <line x1="8.5" y1="12" x2="13.5" y2="11" strokeWidth="3" />
      <line x1="3" y1="21" x2="21" y2="21" />
    </svg>
  )
}
