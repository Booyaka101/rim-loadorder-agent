import {defineArrayMember, defineField, defineType} from 'sanity'

export const modList = defineType({
  name: 'modList',
  title: 'Mod list',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'gameVersion', type: 'string'}),
    defineField({
      name: 'entries',
      description: 'Active mods in load order, top to bottom.',
      type: 'array',
      of: [defineArrayMember({type: 'modLink'})],
    }),
    defineField({
      name: 'disabled',
      description: 'Mods that were tried in this list and switched off, with the reason.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({name: 'mod', type: 'modLink'}),
            defineField({name: 'reason', type: 'string'}),
          ],
          preview: {select: {title: 'mod.packageId', subtitle: 'reason'}},
        }),
      ],
    }),
  ],
})
