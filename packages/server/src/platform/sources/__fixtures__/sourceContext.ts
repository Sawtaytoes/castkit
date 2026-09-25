import type { SourceContext } from "@castkit/sdk/plugin"
import { vi } from "vitest"

/** Isolated adapter context with no real network or broker connections. */
export const sourceContext = (overrides:Partial<SourceContext>={}) => ({source:{id:"source",name:"Source",adapter:"mqtt",settings:{url:"https://service.example"},isEnabled:true},channels:[{id:"channel",name:"Channel",sourceId:"source",type:"entities.v1",settings:{entityIds:["light.desk"]}}],secrets:{token:"test-token",apiKey:"test-key"},signal:new AbortController().signal,fetch:vi.fn<typeof fetch>(),publish:vi.fn(),reportError:vi.fn(),mqtt:{subscribe:vi.fn(),unsubscribe:vi.fn(),publish:vi.fn()},...overrides} satisfies SourceContext)
