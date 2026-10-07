import type { ContractData } from "@castkit/sdk/contracts"
import { HomePicker } from "./HomePicker.tsx"
import { LightControls } from "./LightControls.tsx"

export type HomeControlProps =
  | {
      kind: "light"
      entity: ContractData["entities.v1"]["entities"][number]
      request: (request: {
        action: string
        payload?: Record<string, unknown>
      }) => void
    }
  | {
      kind: "choice"
      label: string
      value: string
      options: string[]
      onChange: (value: string) => void
    }
/** Home control shapes are loaded only by dashboards that request them. */
export const HomeControl = (props: HomeControlProps) =>
  props.kind === "light" ? (
    <LightControls
      entity={props.entity}
      request={props.request}
    />
  ) : (
    <HomePicker
      label={props.label}
      value={props.value}
      options={props.options}
      onChange={props.onChange}
    />
  )
