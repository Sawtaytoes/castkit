import { Component, type ComponentChildren } from "preact"
import { useEffect, useState } from "preact/hooks"
import { CompositionVisibility } from "./CompositionVisibility.ts"
import {
  listPreparedDisplays,
  subscribePreparedDisplays,
} from "./displayCache.ts"
import type {
  DisplaySnapshot,
  DisplayTarget,
} from "./protocol.ts"

type EntryProps = {
  snapshot: DisplaySnapshot
  isVisible: boolean
  renderComposition: (entry: {
    snapshot: DisplaySnapshot
    isVisible: boolean
  }) => ComponentChildren
}

class PreparedComposition extends Component<EntryProps> {
  shouldComponentUpdate(next: EntryProps) {
    return (
      next.isVisible ||
      next.isVisible !== this.props.isVisible
    )
  }

  render() {
    const { snapshot, isVisible, renderComposition } =
      this.props
    return (
      <CompositionVisibility.Provider value={isVisible}>
        <div
          class="platform-composition"
          data-composition-visible={String(isVisible)}
          aria-hidden={!isVisible}
          inert={!isVisible}
          style={{
            display: "flex",
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            visibility: isVisible ? "visible" : "hidden",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          {renderComposition({ snapshot, isVisible })}
        </div>
      </CompositionVisibility.Provider>
    )
  }
}

/** Retain four prepared view trees; only the selected one can paint or accept input. */
export const CompositionDeck = ({
  snapshot,
  target,
  renderComposition,
}: {
  snapshot: DisplaySnapshot
  target: DisplayTarget
  renderComposition: EntryProps["renderComposition"]
}) => {
  const [, refresh] = useState(0)
  const [hasPrepared, setHasPrepared] = useState(false)
  useEffect(() => {
    const pending = { timer: 0 }
    const changed = () => {
      refresh((revision) => revision + 1)
      clearTimeout(pending.timer)
      // Give the active composition its first paint before constructing standby trees.
      pending.timer = window.setTimeout(() => {
        setHasPrepared(true)
        refresh((revision) => revision + 1)
      }, 300)
    }
    const unsubscribe = subscribePreparedDisplays(changed)
    changed()
    return () => {
      unsubscribe()
      clearTimeout(pending.timer)
    }
  }, [])
  const entries = [
    snapshot,
    ...(hasPrepared
      ? listPreparedDisplays(target)
      : []
    ).filter(
      (entry) =>
        entry.view.id !== snapshot.view.id &&
        entry.view.panels.every((panel) =>
          [
            "idle-dashboard",
            "kids-points",
            "music-player",
            "clock",
            "ambient",
            "calendar",
            "agenda",
            "text",
            "weather",
            "timers",
            "points",
            "entities",
            "queue",
            "print-queue",
          ].includes(panel.specId),
        ) &&
        !entry.viewSpecs?.some((spec) => spec.browserEntry),
    ),
  ]
  const retained = [
    ...new Map(
      entries.map((entry) => [entry.view.id, entry]),
    ).values(),
  ].slice(0, 4)
  return (
    <>
      {retained.map((entry) => (
        <PreparedComposition
          key={entry.view.id}
          snapshot={entry}
          isVisible={entry.view.id === snapshot.view.id}
          renderComposition={renderComposition}
        />
      ))}
    </>
  )
}
