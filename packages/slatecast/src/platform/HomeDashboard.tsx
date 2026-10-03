import type { ViewPanel } from "@castkit/sdk/contracts"
import type { ComponentChildren } from "preact"

type Item = { key: string; panel: ViewPanel; data: unknown }
/** Configured groups retain panel order and bindings; no installation IDs enter the renderer. */
export const homePanelGroups = (panels: Item[]) =>
  panels.reduce<
    {
      id: string
      title: string
      accent: string
      panels: Item[]
    }[]
  >((groups, item) => {
    const id = String(
      item.panel.settings.homeGroup || item.key,
    )
    const previous = groups.find((group) => group.id === id)
    if (previous)
      return groups.map((group) =>
        group === previous
          ? { ...group, panels: group.panels.concat(item) }
          : group,
      )
    return groups.concat({
      id,
      title: String(
        item.panel.settings.homeGroupTitle ??
          item.panel.settings.title ??
          "",
      ),
      accent: String(
        item.panel.settings.homeAccent ?? "blue",
      ),
      panels: [item],
    })
  }, [])

/** Household compositions scroll as one surface, with content-sized room and device groups. */
export const HomeDashboard = ({
  panels,
  renderPanel,
}: {
  panels: Item[]
  renderPanel: (item: Item) => ComponentChildren
}) => (
  <div
    class="home-dashboard"
    data-camera-wall={String(
      panels.length > 0 &&
        panels.every(
          (item) => item.panel.specId === "cameras",
        ),
    )}
  >
    {homePanelGroups(panels).map((group) => (
      <section
        key={group.id}
        class="home-group"
        data-accent={group.accent}
        data-span={
          group.panels[0]?.panel.settings.homeGroupSpan
        }
        aria-label={group.title}
      >
        {group.title ? (
          <h2 class="home-group-title">{group.title}</h2>
        ) : null}
        {group.panels.map((item) =>
          renderPanel({
            ...item,
            panel: {
              ...item.panel,
              settings: {
                ...item.panel.settings,
                title:
                  item.panel.settings.title === group.title
                    ? ""
                    : item.panel.settings.title,
              },
            },
          }),
        )}
      </section>
    ))}
  </div>
)
