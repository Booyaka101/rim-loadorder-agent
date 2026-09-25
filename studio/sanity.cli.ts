import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '49jweiga',
    dataset: 'production'
  },
  studioHost: 'rimworld-loadorder',
  deployment: {
    appId: 'q2bmwuykxynu1bbmsqcr0ocn',
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
})
