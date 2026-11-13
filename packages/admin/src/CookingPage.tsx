import type { RecipeDisplay } from "@castkit/sdk/recipe"
import { Button, Card } from "@charcuterie/ui"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  ExternalLink,
} from "lucide-react"

/** A cooking session as the server reports it to management and phone controls. */
export type CookingSession = {
  id: string
  revision: number
  sourceId: string
  deviceId: string
  display: RecipeDisplay
  targetId: string
  controlPath: string
}

/** One recipe page with its paging controls, shared by management and the phone link. */
export const CookingPage = ({
  session,
  send,
  isBusy,
}: {
  session: CookingSession
  send: (action: string) => void
  isBusy: boolean
}) => {
  const data = session.display
  return (
    <div className="grid min-w-0 gap-4">
      <Card>
        <div className="grid gap-3">
          <p className="text-sm text-content-secondary">
            COOKING · Page {data.pageIndex + 1} of{" "}
            {data.pageCount}
          </p>
          <h2 className="font-semibold text-2xl">
            {data.recipe.name}
          </h2>
          <p className="text-content-secondary">
            {data.recipe.yieldText}
          </p>
          {data.page.isComplete ? (
            <>
              <h3 className="font-semibold text-lg">
                Ingredients
              </h3>
              <ul className="list-disc break-words ps-6 text-lg leading-relaxed">
                {data.recipe.ingredients.map(
                  (item, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: ingredients can repeat and never reorder
                    <li key={index}>{item}</li>
                  ),
                )}
              </ul>
              <h3 className="font-semibold text-lg">
                Method
              </h3>
              <ol className="list-decimal break-words ps-6 text-lg leading-relaxed">
                {data.recipe.instructions.map(
                  (step, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: steps never reorder
                    <li key={index}>{step}</li>
                  ),
                )}
              </ol>
              {data.recipe.notes.length ? (
                <>
                  <h3 className="font-semibold text-lg">
                    Notes
                  </h3>
                  {data.recipe.notes.map((note, index) => (
                    <p
                      // biome-ignore lint/suspicious/noArrayIndexKey: notes never reorder
                      key={index}
                      className="whitespace-pre-wrap break-words text-lg leading-relaxed"
                    >
                      {note}
                    </p>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              <h3 className="font-semibold text-lg">
                {data.page.heading}
              </h3>
              <p className="whitespace-pre-wrap break-words font-mono text-lg leading-relaxed">
                {data.page.lines.join("\n")}
              </p>
            </>
          )}
          <a
            className="inline-flex items-center gap-2 underline"
            href={data.recipe.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={18} />
            Open in Mealie
          </a>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="outline"
          isDisabled={isBusy || data.pageIndex === 0}
          onClick={() => send("previous")}
        >
          <ArrowLeft />
          Previous
        </Button>
        <Button
          isDisabled={
            isBusy || data.pageIndex + 1 === data.pageCount
          }
          onClick={() => send("next")}
        >
          <ArrowRight />
          Next
        </Button>
        <Button
          appearance="outline"
          isDisabled={isBusy}
          onClick={() => send("ingredients")}
        >
          <ClipboardList />
          Ingredients
        </Button>
        <Button
          appearance="outline"
          isDisabled={isBusy}
          onClick={() => send("instructions")}
        >
          <BookOpen />
          Instructions
        </Button>
        <Button
          appearance="outline"
          isDisabled={isBusy}
          onClick={() => send("done")}
        >
          <Check />
          Done cooking
        </Button>
      </div>
      <p className="text-sm text-content-secondary">
        The display stays on this page until you change it.
        ePaper needs power to receive another page; an
        unplugged panel retains its last image. Page changes
        can take a full screen refresh.
      </p>
    </div>
  )
}
