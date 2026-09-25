import { gzipSync } from "node:zlib"
import type { PluginManifest } from "@castkit/sdk/plugin"

/** Synthetic tar fixture can deliberately represent unsafe headers for installer tests. */
export const createTarArchive = (entries:{path:string;content?:string|Buffer;type?:string}[]) => {
  const blocks=entries.flatMap(({path,content="",type="0"})=>{
    const bytes=Buffer.isBuffer(content)?content:Buffer.from(content)
    const header=Buffer.alloc(512)
    header.write(path,0,100,"utf8")
    header.write("0000600\0",100,8,"ascii")
    header.write("0000000\0",108,8,"ascii")
    header.write("0000000\0",116,8,"ascii")
    header.write(`${bytes.length.toString(8).padStart(11,"0")}\0`,124,12,"ascii")
    header.write("00000000000\0",136,12,"ascii")
    header.fill(32,148,156)
    header.write(type,156,1,"ascii")
    header.write("ustar\0",257,6,"ascii")
    header.write("00",263,2,"ascii")
    const checksum=header.reduce((total,byte)=>total+byte,0)
    header.write(`${checksum.toString(8).padStart(6,"0")}\0 `,148,8,"ascii")
    return [header,bytes,Buffer.alloc((512-bytes.length%512)%512)]
  })
  return gzipSync(Buffer.concat(blocks.concat(Buffer.alloc(1024))))
}
/** A complete, dependency-free runtime package; overrides support update and negative fixtures. */
export const createPluginArchive = ({version="1.0.0",manifest,files={},packageJson={}}:{version?:string;manifest?:PluginManifest;files?:Record<string,string|Buffer>;packageJson?:Record<string,unknown>}={}) => {
  const resolvedManifest=manifest??{
    id:"example.runtime",name:"Example runtime",version,apiVersion:1,adapters:[],viewSpecs:[{id:"runtime-example",name:"Runtime example",description:"Synthetic runtime view",inputs:[],settings:[],renderers:["browser"],browserEntry:"dist/browser/view.js"}],
  }
  const contents={
    "package.json":JSON.stringify({name:"@example/runtime-plugin",version,type:"module",description:"Synthetic package",license:"MIT",castkit:{apiVersion:1,manifest:"castkit.manifest.json",server:"dist/server.js",publicDirectory:"dist/browser"},...packageJson}),
    "castkit.manifest.json":JSON.stringify(resolvedManifest),
    "dist/server.js":`export default {manifest:${JSON.stringify(resolvedManifest)}}`,
    "dist/browser/view.js":"export const mount = element => {element.textContent='Runtime example';return {update(){},destroy(){element.textContent=''}}}",
    ...files,
  }
  return createTarArchive(Object.entries(contents).map(([path,content])=>({path:`package/${path}`,content})))
}
