/** A reusable rendering profile; names are search aliases, never rendering inputs. */
export type PreviewProfile = {
  id: string
  label: string
  width: number
  height: number
  delivery: "browser" | "image"
  deviceId: string
  deviceLabels: string[]
  deviceIds: string[]
  unsupportedViews: Record<string, string[]>
}
