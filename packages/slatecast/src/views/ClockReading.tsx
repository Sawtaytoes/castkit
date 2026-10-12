/**
 * The time as the clock-family views draw it: the digits, then the compact
 * a/p suffix in its own smaller span on the digits' baseline. Agenda, Ambient
 * and Clock all draw this one reading, so a size or format decision lands on
 * every face at once. Each caller names the classes its stylesheet sizes.
 */
export const ClockReading = ({
  time,
  meridiem,
  class: className,
  timeClass,
  meridiemClass,
}: {
  time: string
  meridiem: string
  class: string
  timeClass: string
  meridiemClass: string
}) => (
  <span class={className}>
    <span class={timeClass}>{time}</span>
    {meridiem ? (
      <span class={meridiemClass}>{meridiem}</span>
    ) : null}
  </span>
)
