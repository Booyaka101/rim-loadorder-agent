import {defineField, defineType} from 'sanity'

// An ordering or compatibility constraint that did not come from the mod's own
// About.xml. Keeping provenance separate is what lets the agent say who claims what.
export const rule = defineType({
  name: 'rule',
  title: 'Rule',
  type: 'document',
  fields: [
    defineField({name: 'subject', type: 'modLink', validation: (rule) => rule.required()}),
    defineField({
      name: 'relation',
      type: 'string',
      options: {list: ['loadAfter', 'loadBefore', 'loadTop', 'loadBottom', 'incompatibleWith']},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'target', type: 'modLink', hidden: ({parent}) => parent?.relation === 'loadTop' || parent?.relation === 'loadBottom'}),
    defineField({
      name: 'source',
      type: 'string',
      options: {list: [
        {title: 'RimSort community rules', value: 'rimsort-community'},
        {title: 'Owner, found in play', value: 'owner'},
      ]},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'note', type: 'text', rows: 2}),
  ],
  preview: {
    select: {subject: 'subject.packageId', relation: 'relation', target: 'target.packageId', source: 'source'},
    prepare: ({subject, relation, target, source}) => ({
      title: `${subject} ${relation} ${target ?? ''}`.trim(),
      subtitle: source,
    }),
  },
})
