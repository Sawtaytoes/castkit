import { createPlatformCatalog } from "../../packages/server/src/platform/platformCatalog.ts"
import type { Platform } from "../../packages/admin/src/platformApi.ts"

/** Synthetic configuration for browser checks and public review images. */
export const managementPlatform = ():Platform => {
  const catalog = createPlatformCatalog()
  return {
    deviceScreens:{},sources:[{id:"sample-source",name:"Sample source",adapter:"mqtt",settings:{},isEnabled:true}],channels:[{id:"sample-data",name:"Sample entities",sourceId:"sample-source",type:"entities.v1",settings:{}}],plugins:[],adapters:catalog.adapters,viewSpecs:catalog.viewSpecs,presets:catalog.presets,channelStates:{},
    views:Array.from({length:61},(_,index) => ({id:`view-${index}`,name:index === 0 ? "Room controls" : `Sample view ${index}`,tags:index < 20 ? ["Controls"] : index < 40 ? ["Information"] : ["Media"],layout:"single",theme:"auto",access:"public",isControlEnabled:false,panels:[{id:"main",specId:"entities",bindings:{data:"sample-data"},settings:{entityIds:["fan.example"],aliasesJson:'{"fan.example":"Ceiling fan"}',visibleWhenJson:'{"any":[{"entityId":"sensor.example","state":["on","ready"]},{"all":[{"entityId":"sensor.other","notState":"unavailable"},{"mediaQuery":"(min-width: 600px)"}]}]}',actionButtonsJson:'[{"name":"Run scene","entityId":"script.example","action":"turn_on","payload":{"count":3,"enabled":true},"extensionHint":"preserve me"}]'}}]})),
    screens:[{id:"browser-screen",name:"Browser dashboard",tags:["Controls"],access:"public",defaultViewId:"view-0",viewIds:["view-0","view-1"]}]
  }
}
