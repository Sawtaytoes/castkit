/** Access metadata stays with the app; the icon is not an action. */
export const AccessIndicator = ({
  hasPin,
}: {
  hasPin?: boolean
}) => {
  const label =
    hasPin === false
      ? "PIN protected; PIN not set"
      : "PIN protected"
  return (
    <svg
      className="size-4 shrink-0 text-content-secondary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      <path d="M12 14v3" />
    </svg>
  )
}
