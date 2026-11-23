import type { ContractData } from "@castkit/sdk/contracts"

type UsageMark = NonNullable<
  ContractData["ai-usage.v1"]["providers"][number]["mark"]
>

/**
 * The provider's own product mark, as the producer sent it. CastKit keeps no
 * logos of its own, so a provider the producer adds draws its mark here with
 * no change to CastKit. A provider sent without a mark draws none.
 */
export const AiUsageProviderIcon = ({
  mark,
}: {
  mark: UsageMark | undefined
}) =>
  mark ? (
    <svg
      class="ai-usage-provider-icon"
      viewBox={mark.viewBox}
      aria-hidden="true"
      {...(mark.strokeWidth === undefined
        ? { fill: "currentColor" }
        : {
            fill: "none",
            stroke: "currentColor",
            "stroke-width": mark.strokeWidth,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          })}
    >
      {mark.paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          {...(path.opacity === undefined
            ? {}
            : { opacity: path.opacity })}
        />
      ))}
    </svg>
  ) : null
