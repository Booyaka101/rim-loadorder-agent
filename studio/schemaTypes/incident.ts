import {defineArrayMember, defineField, defineType} from 'sanity'

// A real failure seen in Player.log while getting a list to load clean, and what fixed it.
export const incident = defineType({
  name: 'incident',
  title: 'Incident',
  type: 'document',
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'date', type: 'date'}),
    defineField({name: 'symptom', type: 'text', description: 'What the log or the game showed.'}),
    defineField({name: 'signature', type: 'string', description: 'The log line to match on.'}),
    defineField({name: 'cause', type: 'text'}),
    defineField({name: 'fix', type: 'text'}),
    defineField({name: 'mods', type: 'array', of: [defineArrayMember({type: 'modLink'})]}),
    defineField({
      name: 'verdict',
      type: 'string',
      options: {list: ['fixed', 'harmless', 'disabled-mod', 'unfixable']},
    }),
  ],
})
