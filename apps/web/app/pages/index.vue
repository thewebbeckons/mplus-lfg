<script setup lang="ts">
const config = useRuntimeConfig()

const inviteUrl = config.public.discordApplicationId
  ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(config.public.discordApplicationId)}&scope=bot%20applications.commands&permissions=19456&integration_type=0`
  : undefined

/** What the bot does across every feature, kept short enough to scan. */
const pillars = [
  {
    icon: 'i-lucide-zap',
    title: 'Fast and out of the way',
    description: 'Runs right inside Discord, so your guild gets organized without opening another site or waiting around.'
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'No double-booking',
    description: 'The moment someone claims the last spot — or picks up a crafting order — it is theirs. Everyone sees the same accurate state, even when several people click at once.'
  },
  {
    icon: 'i-lucide-sparkles',
    title: 'Keeps channels tidy',
    description: 'Finished, cancelled, and expired posts are closed out and cleared automatically, so old buttons do not linger.'
  }
]

const lfgFeatures = [
  {
    icon: 'i-lucide-calculator',
    title: 'Flexible group setup',
    description: 'Type "LF 2 DPS", "1/1/3", or "LF1M tank" and the bot works out which spots are covered and which are still open.'
  },
  {
    icon: 'i-lucide-clock',
    title: 'Times everyone understands',
    description: 'Say "in 30 mins" or "8:00 PM EST" and Discord shows the start time in each player\'s local timezone.'
  },
  {
    icon: 'i-lucide-users',
    title: 'Clear, quiet rosters',
    description: 'See exactly who joined each role without pinging the whole server.'
  }
]

const craftFeatures = [
  {
    icon: 'i-lucide-link',
    title: 'Paste a Wowhead link',
    description: 'Drop in the item page and the bot pulls the name, quality, and icon, then keeps your exact link — bonus IDs and all — one click away.'
  },
  {
    icon: 'i-lucide-hand',
    title: 'One crafter per order',
    description: 'Crafters claim what they can make, release it if plans change, and mark it done. Restrict claiming to a crafter role if you want.'
  },
  {
    icon: 'i-lucide-mail-check',
    title: 'Nobody gets forgotten',
    description: 'When an order is finished the requester gets a DM with the item, the crafter, and a jump link back to the request.'
  }
]

const steps = [
  {
    number: '01',
    title: 'Set up your channels',
    description: 'An admin runs /setup once to pick an LFG channel, a crafting channel, your server timezone, and an optional crafter role.'
  },
  {
    number: '02',
    title: 'Post what you need',
    description: '/lfg starts a Mythic+ group with the roles you are missing. /craft posts a crafting order from a Wowhead item link.'
  },
  {
    number: '03',
    title: 'Everyone stays up to date',
    description: 'Players click a role, crafters claim an order, and the posts update themselves — then clean themselves up when they are done.'
  }
]

const syntaxExamples = [
  { input: '(blank)', description: 'Standard 1 tank / 1 healer / 3 dps, all 5 slots open' },
  { input: '1/1/3', description: 'Standard composition written out — also accepts 1t 1h 3d or 1-1-3' },
  { input: 'LF 2 DPS', description: 'Standard party, but 1 tank, 1 healer, and 1 dps already premade' },
  { input: 'LF1M tank', description: 'Four players ready, looking for 1 tank to start' },
  { input: '2/1/2 lf 1 dps', description: 'Custom composition with 2 tanks, 1 healer, 2 dps (only 1 dps open)' }
]
</script>

<template>
  <div class="selection:bg-[#5865F2]/20 selection:text-[#5865F2]">
      <!-- Hero Section -->
      <section class="relative pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <!-- Tagline Badge -->
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20 mb-6">
            <UIcon name="i-lucide-shield" class="w-3.5 h-3.5" />
            <span>{{ BRAND.tagline }}</span>
          </div>

          <!-- Main Hero Headline -->
          <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight text-(--ui-text-highlighted) max-w-4xl mx-auto leading-tight sm:leading-none">
            {{ BRAND.heroHeadline }}
          </h1>

          <!-- Hero Subtitle -->
          <p class="mt-6 text-lg sm:text-xl text-(--ui-text-muted) max-w-2xl mx-auto leading-relaxed">
            {{ BRAND.heroSubtitle }}
          </p>

          <!-- Feature chips: what ships today -->
          <div class="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <NuxtLink
              :to="`#${BRAND.features.lfg.anchor}`"
              class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border border-(--ui-border) bg-(--ui-bg) hover:border-[#5865F2]/40 transition-colors"
            >
              <UIcon name="i-lucide-swords" class="w-4 h-4 text-[#5865F2]" />
              <code class="font-mono text-xs text-(--ui-text-highlighted)">/lfg</code>
              <span class="text-(--ui-text-muted)">{{ BRAND.features.lfg.label }}</span>
            </NuxtLink>
            <NuxtLink
              :to="`#${BRAND.features.crafting.anchor}`"
              class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border border-(--ui-border) bg-(--ui-bg) hover:border-[#5865F2]/40 transition-colors"
            >
              <UIcon name="i-lucide-hammer" class="w-4 h-4 text-[#5865F2]" />
              <code class="font-mono text-xs text-(--ui-text-highlighted)">/craft</code>
              <span class="text-(--ui-text-muted)">{{ BRAND.features.crafting.label }}</span>
            </NuxtLink>
          </div>

          <!-- CTA Buttons -->
          <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <UButton
              :to="inviteUrl"
              :disabled="!inviteUrl"
              :title="inviteUrl ? undefined : 'Set NUXT_PUBLIC_DISCORD_APPLICATION_ID to enable this link'"
              target="_blank"
              rel="noopener noreferrer"
              size="xl"
              class="w-full sm:w-auto bg-[#5865F2] hover:bg-[#4752C4] disabled:bg-[#5865F2] text-white disabled:text-white font-semibold shadow-lg shadow-[#5865F2]/20 px-8"
              icon="i-simple-icons-discord"
              data-insightflare-event="add_to_discord_click"
              data-insightflare-event-location="hero"
            >
              Add to Discord
            </UButton>

            <UButton
              :to="GITHUB_URL"
              target="_blank"
              rel="noopener noreferrer"
              size="xl"
              color="neutral"
              variant="subtle"
              class="w-full sm:w-auto"
              icon="i-simple-icons-github"
              data-insightflare-event="github_link_click"
              data-insightflare-event-location="hero"
            >
              View on GitHub
            </UButton>
          </div>
        </div>
      </section>

      <!-- Shared strengths -->
      <section class="pb-20">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              v-for="pillar in pillars"
              :key="pillar.title"
              class="p-6 rounded-2xl bg-(--ui-bg) border border-(--ui-border) hover:border-[#5865F2]/40 transition-colors shadow-sm"
            >
              <div class="w-10 h-10 rounded-xl bg-[#5865F2]/10 text-[#5865F2] flex items-center justify-center mb-4">
                <UIcon :name="pillar.icon" class="w-5 h-5" />
              </div>
              <h3 class="text-base font-bold text-(--ui-text-highlighted) mb-2">
                {{ pillar.title }}
              </h3>
              <p class="text-sm text-(--ui-text-muted) leading-relaxed">
                {{ pillar.description }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Feature: Looking for Group -->
      <section :id="BRAND.features.lfg.anchor" class="py-20 bg-(--ui-bg-elevated)/40 border-y border-(--ui-border) scroll-mt-16">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-12">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20 mb-4">
              <UIcon name="i-lucide-swords" class="w-3.5 h-3.5" />
              <span>{{ BRAND.features.lfg.label }}</span>
            </div>
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              Fill a Mythic+ group without the back-and-forth
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              Post a run with <code class="px-1.5 py-0.5 rounded bg-(--ui-bg-muted) text-(--ui-text-highlighted) font-mono text-sm">/lfg</code>, and let players claim the roles you still need.
            </p>
          </div>

          <div class="mb-10">
            <div class="text-xs uppercase tracking-wider font-semibold text-(--ui-text-muted) mb-3 text-center">
              Interactive Live Preview
            </div>
            <DiscordMockup />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              v-for="feature in lfgFeatures"
              :key="feature.title"
              class="p-6 rounded-2xl bg-(--ui-bg) border border-(--ui-border) hover:border-[#5865F2]/40 transition-colors shadow-sm"
            >
              <div class="w-10 h-10 rounded-xl bg-[#5865F2]/10 text-[#5865F2] flex items-center justify-center mb-4">
                <UIcon :name="feature.icon" class="w-5 h-5" />
              </div>
              <h3 class="text-base font-bold text-(--ui-text-highlighted) mb-2">
                {{ feature.title }}
              </h3>
              <p class="text-sm text-(--ui-text-muted) leading-relaxed">
                {{ feature.description }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Feature: Crafting Requests -->
      <section :id="BRAND.features.crafting.anchor" class="py-20 scroll-mt-16">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-12">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20 mb-4">
              <UIcon name="i-lucide-hammer" class="w-3.5 h-3.5" />
              <span>{{ BRAND.features.crafting.label }}</span>
            </div>
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              Turn "can anyone craft this?" into a queue
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              Post an order with <code class="px-1.5 py-0.5 rounded bg-(--ui-bg-muted) text-(--ui-text-highlighted) font-mono text-sm">/craft</code>, and let your crafters pick up what they can make.
            </p>
          </div>

          <div class="mb-10">
            <div class="text-xs uppercase tracking-wider font-semibold text-(--ui-text-muted) mb-3 text-center">
              Open · Claimed · Completed
            </div>
            <CraftMockup />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              v-for="feature in craftFeatures"
              :key="feature.title"
              class="p-6 rounded-2xl bg-(--ui-bg) border border-(--ui-border) hover:border-[#5865F2]/40 transition-colors shadow-sm"
            >
              <div class="w-10 h-10 rounded-xl bg-[#5865F2]/10 text-[#5865F2] flex items-center justify-center mb-4">
                <UIcon :name="feature.icon" class="w-5 h-5" />
              </div>
              <h3 class="text-base font-bold text-(--ui-text-highlighted) mb-2">
                {{ feature.title }}
              </h3>
              <p class="text-sm text-(--ui-text-muted) leading-relaxed">
                {{ feature.description }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- How It Works Section -->
      <section id="how-it-works" class="py-20 bg-(--ui-bg-elevated)/40 border-y border-(--ui-border) scroll-mt-16">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-14">
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              How it works
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              No separate website or account needed. Everything happens inside your Discord server.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div
              v-for="step in steps"
              :key="step.number"
              class="p-6 rounded-2xl bg-(--ui-bg) border border-(--ui-border) relative flex flex-col justify-between shadow-sm"
            >
              <div>
                <span class="text-3xl font-black text-[#5865F2]/40 font-mono block mb-3">
                  {{ step.number }}
                </span>
                <h3 class="text-lg font-bold text-(--ui-text-highlighted) mb-2">
                  {{ step.title }}
                </h3>
                <p class="text-sm text-(--ui-text-muted) leading-relaxed">
                  {{ step.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Syntax Guide Section -->
      <section id="syntax" class="py-20 scroll-mt-16">
        <div class="max-w-4xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-12">
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              Tell it what your group needs
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              Use familiar shorthand to say which roles you already have and which ones you still need.
            </p>
          </div>

          <div class="rounded-2xl border border-(--ui-border) bg-(--ui-bg) overflow-hidden shadow-sm">
            <div class="divide-y divide-(--ui-border)">
              <div
                v-for="syntax in syntaxExamples"
                :key="syntax.input"
                class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div class="font-mono text-sm font-semibold text-[#5865F2] bg-[#5865F2]/10 px-2.5 py-1 rounded w-fit">
                  {{ syntax.input }}
                </div>
                <div class="text-sm text-(--ui-text-muted) sm:text-right">
                  {{ syntax.description }}
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 text-center text-xs text-(--ui-text-muted)">
            You can say <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">need</code>, <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">looking for</code>, or <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">want</code>, or use a leading <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">+</code> to describe open spots.
          </div>
        </div>
      </section>

      <!-- Bottom Call To Action Banner -->
      <section class="py-20 border-t border-(--ui-border)">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div class="p-8 sm:p-12 rounded-3xl bg-[#5865F2] text-white shadow-xl shadow-[#5865F2]/10 relative overflow-hidden">
            <div class="relative z-10 max-w-2xl mx-auto">
              <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight">
                {{ BRAND.ctaHeadline }}
              </h2>
              <p class="mt-4 text-white/80 text-base sm:text-lg leading-relaxed">
                {{ BRAND.ctaBody }}
              </p>
              <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <UButton
                  :to="inviteUrl"
                  :disabled="!inviteUrl"
                  :title="inviteUrl ? undefined : 'Set NUXT_PUBLIC_DISCORD_APPLICATION_ID to enable this link'"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xl"
                  class="w-full sm:w-auto bg-white disabled:bg-white text-[#5865F2] disabled:text-[#5865F2] hover:bg-white/90 font-bold px-8 shadow-md"
                  icon="i-simple-icons-discord"
                  data-insightflare-event="add_to_discord_click"
                  data-insightflare-event-location="cta"
                >
                  Add to Discord
                </UButton>
                <UButton
                  :to="GITHUB_URL"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xl"
                  variant="outline"
                  class="w-full sm:w-auto text-white border-white/40 hover:bg-white/10"
                  icon="i-simple-icons-github"
                  data-insightflare-event="github_link_click"
                  data-insightflare-event-location="cta"
                >
                  GitHub Repository
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </section>
  </div>
</template>
