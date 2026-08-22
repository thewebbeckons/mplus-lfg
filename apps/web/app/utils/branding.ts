/**
 * Every user-facing name and headline for the marketing site, in one place.
 *
 * `Guild Helper` is a working name. The Cloudflare Worker, the D1 database, the
 * npm package scope, the repository, and the domain all keep their original
 * `mplus-lfg` identifiers — renaming those would break a live deployment — so a
 * future rebrand is a change to this file and nothing else.
 *
 * Imported by `nuxt.config.ts` as well as by components, so it must stay a
 * plain object with no Nuxt runtime imports.
 */
export const BRAND = {
  name: 'Guild Helper',
  tagline: 'World of Warcraft Guild Helper for Discord',
  title: 'Guild Helper — World of Warcraft Guild Bot for Discord',
  description:
    'A Discord bot for World of Warcraft guilds. Organize Mythic+ groups with /lfg and manage crafting requests with /craft, without leaving Discord.',
  heroHeadline: 'Everything your WoW guild does, in Discord.',
  heroSubtitle:
    'Fill Mythic+ groups and get your crafting orders made, without a second website, a spreadsheet, or a dozen "who needs what" messages.',
  ctaHeadline: 'Ready to run your guild from Discord?',
  ctaBody:
    'Add Guild Helper to your server in seconds. Free and open source, with everything happening where your guild already plays.',
  /** Short labels for the two shipped features, reused in nav and headings. */
  features: {
    lfg: { label: 'Looking for Group', anchor: 'lfg' },
    crafting: { label: 'Crafting Requests', anchor: 'crafting' },
  },
} as const
