import { createContext } from "preact"
import { useContext } from "preact/hooks"

/** Hidden prepared compositions stop their clocks and layout observers. */
export const CompositionVisibility = createContext(true)

/** Standalone views remain active when no retained-composition host is present. */
export const useCompositionVisibility = () =>
  useContext(CompositionVisibility)
