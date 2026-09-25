import {defineField, defineType} from 'sanity'

// Mirrors one <li> of an About.xml relation. The packageId is kept even when the
// target mod isn't in the dataset, so unresolved dependencies stay visible.
export const modLink = defineType({
  name: 'modLink',
  title: 'Mod link',
  type: 'object',
  fields: [
    defineField({name: 'packageId', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'mod', type: 'reference', to: [{type: 'mod'}], weak: true}),
    defineField({name: 'displayName', type: 'string'}),
  ],
  preview: {select: {title: 'mod.title', subtitle: 'packageId'}},
})
