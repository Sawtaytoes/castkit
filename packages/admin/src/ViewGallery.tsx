import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Picker,
  VirtualizedGrid,
} from "@charcuterie/ui"
import { useState } from "react"
import { LivePreviewFrame } from "./LivePreviewFrame.tsx"
import {
  PreviewSizing,
  type usePreviewSizing,
} from "./PreviewSizing.tsx"
import { inputClass, type Platform } from "./platformApi.ts"

/** Browse saved views with live data, without creating screens or device assignments. */
export const ViewGallery = ({
  platform,
  sizing,
}: {
  platform: Platform
  sizing: ReturnType<typeof usePreviewSizing>
}) => {
  const [search, setSearch] = useState("")
  const [tag, setTag] = useState("")
  const [category, setCategory] = useState("")
  const [revision, setRevision] = useState(0)
  const tags = Array.from(
    new Set(
      platform.views.flatMap((view) => view.tags ?? []),
    ),
  ).toSorted()
  const views = platform.views
    .filter(
      (view) =>
        `${view.name} ${view.id} ${(view.tags ?? []).join(" ")}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
        (!tag || view.tags?.includes(tag)) &&
        (!category ||
          view.panels.some(
            (panel) => panel.specId === category,
          )),
    )
    .toSorted((first, second) =>
      first.name.localeCompare(second.name),
    )
  return (
    <div className="view-gallery grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-content-secondary">
          Browse saved views with live data at your chosen
          viewport size.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/views" appearance="outline">
            Edit view
          </ButtonLink>
          <Button
            appearance="outline"
            onClick={() =>
              setRevision((value) => value + 1)
            }
          >
            Refresh previews
          </Button>
        </div>
      </div>
      <div className="gallery-filters">
        <Field label="Find a view">
          <input
            className={inputClass}
            type="search"
            value={search}
            placeholder="Search names, IDs, or tags"
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </Field>
        <Field label="Filter by tag">
          <Picker
            label="Filter by tag"
            value={tag}
            onChange={setTag}
            options={[
              { value: "", label: "All tags" },
              ...tags.map((value) => ({
                value,
                label: value,
              })),
            ]}
          />
        </Field>
        <Field label="Category">
          <Picker
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: "", label: "All categories" },
              ...platform.viewSpecs.map((spec) => ({
                value: spec.id,
                label: spec.name,
              })),
            ]}
          />
        </Field>
      </div>
      <PreviewSizing sizing={sizing} />
      <p className="text-content-secondary text-sm">
        {views.length} of {platform.views.length} views
      </p>
      {views.length ? (
        <VirtualizedGrid
          className="view-gallery-grid"
          items={views}
          itemBlockSize={390}
          minColumnInlineSize={300}
          maxColumns={4}
          overscanRows={0}
          getItemKey={(view) => view.id}
          label="All views"
          renderItem={(view) => (
            <Card heading={view.name}>
              <LivePreviewFrame
                url={`/view/${encodeURIComponent(view.id)}`}
                name={view.name}
                size={sizing.size}
                revision={revision}
                isThumbnail
              />
              <p className="text-content-secondary text-sm">
                {view.tags?.join(" · ") || "Untagged"}
              </p>
              <ButtonLink
                href={`/views/general?item=${encodeURIComponent(view.id)}`}
                appearance="outline"
              >
                Edit view
              </ButtonLink>
            </Card>
          )}
        />
      ) : (
        <EmptyState
          heading="No views match"
          description="Change the search or filters to see more views."
        />
      )}
    </div>
  )
}
