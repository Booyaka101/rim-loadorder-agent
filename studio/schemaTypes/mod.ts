import {defineArrayMember, defineField, defineType} from 'sanity'

const links = (name: string, title: string, description: string) =>
  defineField({name, title, description, type: 'array', of: [defineArrayMember({type: 'modLink'})]})

export const mod = defineType({
  name: 'mod',
  title: 'Mod',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'packageId',
      type: 'string',
      description: 'Lowercased packageId from About.xml. RimWorld compares these case-insensitively.',
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'workshopId', type: 'string'}),
    defineField({name: 'authors', type: 'array', of: [defineArrayMember({type: 'string'})]}),
    defineField({
      name: 'supportedVersions',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      options: {layout: 'tags'},
    }),
    defineField({
      name: 'kind',
      type: 'string',
      options: {list: ['official', 'framework', 'content', 'patch', 'performance']},
    }),
    links('dependencies', 'Dependencies', 'modDependencies: must be active or the game refuses to load this mod cleanly.'),
    links('loadAfter', 'Load after', 'Author-declared: this mod must sit below these in the list.'),
    links('loadBefore', 'Load before', 'Author-declared: this mod must sit above these in the list.'),
    links('incompatibleWith', 'Incompatible with', 'Author-declared hard incompatibilities.'),
    defineField({
      name: 'supersededBy',
      type: 'reference',
      to: [{type: 'mod'}],
      weak: true,
      description: 'The maintained re-upload that replaces this one on the current game version.',
    }),
    defineField({name: 'description', type: 'text', description: 'Workshop description, rich-text tags stripped.'}),
    defineField({name: 'url', type: 'url'}),
  ],
  preview: {select: {title: 'title', subtitle: 'packageId'}},
})
