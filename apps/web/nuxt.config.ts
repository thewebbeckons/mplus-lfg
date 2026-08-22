import { BRAND } from './app/utils/branding'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', 'nitro-cloudflare-dev'],
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-03-10',
  devtools: { enabled: true },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    }
  },
  icon: {
    provider: 'none',
    serverBundle: false,
    clientBundle: {
      scan: true
    }
  },
  runtimeConfig: {
    public: {
      discordApplicationId: ''
    }
  },
  app: {
    head: {
      title: BRAND.title,
      meta: [
        { name: 'description', content: BRAND.description },
        { name: 'og:title', content: BRAND.title },
        { name: 'og:description', content: BRAND.description },
        { name: 'theme-color', content: '#5865F2' }
      ],
      script: [
        { defer: true, src: 'https://insights.thewebbeckons.ca/script.js?siteId=dad98232-3276-4cb6-8a20-d79ae9fac0bc' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  }
})
