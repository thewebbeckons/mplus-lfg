// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-03-10',
  devtools: { enabled: true },
  icon: {
    provider: 'none',
    serverBundle: false,
    clientBundle: {
      scan: true
    }
  },
  runtimeConfig: {
    public: {
      discordApplicationId: '',
      githubUrl: ''
    }
  },
  app: {
    head: {
      title: 'mplus-lfg — World of Warcraft Mythic+ Grouping Bot for Discord',
      meta: [
        { name: 'description', content: 'Serverless Discord bot for organizing WoW Mythic+ keystones. Instant HTTP interactions, smart premades, and concurrency-guarded transactions on Cloudflare Workers.' },
        { name: 'theme-color', content: '#5865F2' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  }
})
