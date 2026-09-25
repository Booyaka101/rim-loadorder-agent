import {createClient} from '@sanity/client'

export const projectId = '49jweiga'
export const dataset = 'production'

// The dataset is public, so the checker reads it without a token.
const client = createClient({projectId, dataset, apiVersion: '2025-02-19', useCdn: false})

export type Source = 'author' | 'rimsort-community' | 'owner'

export interface Mod {
  packageId: string
  title: string
  supportedVersions: string[] | null
  kind: string | null
  dependencies: {packageId: string; displayName: string | null}[] | null
  loadAfter: string[] | null
  loadBefore: string[] | null
  incompatibleWith: string[] | null
  supersededBy: {packageId: string; title: string} | null
}

export interface Rule {
  _id: string
  relation: 'loadAfter' | 'loadBefore' | 'loadTop' | 'loadBottom' | 'incompatibleWith'
  subject: string
  target: string | null
  note: string | null
}

export interface Incident {
  _id: string
  title: string
  verdict: string
  signature: string | null
  fix: string
  mods: string[] | null
}

export interface Content {
  mods: Mod[]
  rules: Rule[]
  incidents: Incident[]
  disabled: {packageId: string; reason: string}[]
}

const QUERY = `{
  "mods": *[_type == "mod" && packageId in $ids]{
    packageId, title, supportedVersions, kind,
    "dependencies": dependencies[]{packageId, displayName},
    "loadAfter": loadAfter[].packageId,
    "loadBefore": loadBefore[].packageId,
    "incompatibleWith": incompatibleWith[].packageId,
    "supersededBy": supersededBy->{packageId, title}
  },
  "rules": *[_type == "rule" && subject.packageId in $ids]{
    _id, relation, note, "subject": subject.packageId, "target": target.packageId
  },
  "incidents": *[_type == "incident"]{_id, title, verdict, signature, fix, "mods": mods[].packageId},
  "disabled": *[_id == "modlist-current"][0].disabled[]{"packageId": mod.packageId, reason}
}`

/** Everything the dataset says about the given mods, in one GROQ round trip. */
export async function fetchContent(ids: string[]): Promise<Content> {
  const res = await client.fetch<Content>(QUERY, {ids})
  return {...res, disabled: res.disabled ?? []}
}

export function query<T = unknown>(groq: string, params: Record<string, unknown> = {}) {
  return client.fetch<T>(groq, params)
}
