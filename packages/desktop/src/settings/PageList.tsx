import {
  Accordion,
  Badge,
  Button,
  EmptyState,
  Field,
  SearchInput,
  Spinner,
} from "@charcuterie/ui"
import { X } from "lucide-react"
import { useState } from "react"
import { groupPages } from "./pageGroups.ts"
import type { PagesResult } from "./settingsApi.ts"

/**
 * The server's pages, grouped by the screen that shows them and filtered by
 * the search, each row with its own Open button. A page the list does not
 * have, a `/d/<id>` device page say, is opened by its address at the end.
 */
export const PageList = ({
  pagesResult,
  onOpen,
}: {
  pagesResult: PagesResult | null
  onOpen: (request: { page: string; name: string }) => void
}) => {
  const [query, setQuery] = useState("")
  const [address, setAddress] = useState("")

  if (pagesResult === null) {
    return (
      <Spinner
        label="Reading the server's pages…"
        isLabelVisible
      />
    )
  }

  const groups = groupPages({
    pages: pagesResult.pages,
    query,
  })

  return (
    <div className="settings-stack settings-fill">
      <SearchInput
        aria-label="Search pages"
        placeholder="Search screens and views"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
        clearIcon={<X size={16} aria-hidden />}
      />
      <div className="settings-scroll">
        {pagesResult.error ? (
          <EmptyState
            heading="The server's pages could not be read"
            headingLevel={3}
            size="sm"
            description={pagesResult.error}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            heading={
              query
                ? "No page matches"
                : "This server has no pages"
            }
            headingLevel={3}
            size="sm"
            description={
              query
                ? "Try fewer words, or open a page by its address below."
                : "Add screens and views in CastKit's management page."
            }
          />
        ) : (
          groups.map((group) => (
            <section
              key={group.key}
              className="page-group"
              aria-labelledby={`group-${group.key}`}
            >
              <h3 id={`group-${group.key}`}>
                {group.heading}
              </h3>
              <ul className="settings-rows">
                {group.entries.map((entry) => (
                  <li
                    key={entry.page.path}
                    className="settings-row"
                  >
                    <div className="settings-row-text">
                      <span className="settings-row-name">
                        <span title={entry.page.name}>
                          {entry.page.name}
                        </span>
                        {entry.page.isPinProtected ? (
                          <Badge
                            intent="neutral"
                            title="Asks for the PIN"
                          >
                            PIN
                          </Badge>
                        ) : null}
                      </span>
                      <span
                        className="settings-row-detail"
                        title={entry.detail}
                      >
                        {entry.detail}
                      </span>
                    </div>
                    <div className="settings-row-actions">
                      <Button
                        size="sm"
                        appearance="outline"
                        aria-label={`Open ${entry.page.name} (${entry.page.path})`}
                        onClick={() =>
                          onOpen({
                            page: entry.page.path,
                            name: entry.page.name,
                          })
                        }
                      >
                        Open
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        <Accordion
          className="page-group"
          headingLevel={3}
          items={[
            {
              key: "address",
              label: "Open a page by its address",
              content: (
                <form
                  className="settings-stack"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onOpen({ page: address, name: address })
                  }}
                >
                  <Field
                    label="Page address"
                    description="A path on this server, such as /d/<device id>, or the page's full address."
                  >
                    <input
                      className="settings-input"
                      value={address}
                      autoComplete="off"
                      placeholder="/d/<device id>"
                      onChange={(event) =>
                        setAddress(event.target.value)
                      }
                    />
                  </Field>
                  <div>
                    <Button
                      type="submit"
                      appearance="outline"
                    >
                      Open
                    </Button>
                  </div>
                </form>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
