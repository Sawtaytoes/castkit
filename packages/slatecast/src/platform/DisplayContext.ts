import { createContext } from "preact"
import type { DisplayTarget } from "./protocol.ts"

/** Authorized page identity for optional built-in services such as map tiles. */
export const DisplayContext =
  createContext<DisplayTarget | null>(null)
