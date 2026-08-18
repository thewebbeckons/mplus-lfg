<script setup lang="ts">
const colorMode = useColorMode()
const config = useRuntimeConfig()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const inviteUrl = config.public.discordApplicationId
  ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(config.public.discordApplicationId)}&scope=bot%20applications.commands&permissions=19456&integration_type=0`
  : undefined
const githubUrl = config.public.githubUrl || undefined

const features = [
  {
    icon: 'i-lucide-zap',
    title: '100% Serverless & Instant',
    description: 'Runs on Cloudflare Workers via HTTP Interactions. Zero idle hosting costs, no websocket gateway drops, and sub-100ms response times.'
  },
  {
    icon: 'i-lucide-calculator',
    title: 'Smart Premade Math',
    description: 'Just type "LF 2 DPS", "1/1/3", or "LF1M tank". The bot calculates open vs reserved slots automatically and locks full roles immediately.'
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Atomic Concurrency Guard',
    description: 'Backed by Cloudflare D1 batch transactions. If two players tap the last healer slot at the exact same millisecond, double-booking is impossible.'
  },
  {
    icon: 'i-lucide-clock',
    title: 'Timezone-Aware Start Times',
    description: 'Accepts relative offsets ("in 30 mins", "1h30m") and absolute times ("8:00 PM EST"), rendering native Discord timestamps for each user\'s timezone.'
  },
  {
    icon: 'i-lucide-sparkles',
    title: 'Automatic Channel Sweeper',
    description: 'A 10-minute scheduled cron sweeps expired runs, keeping your Discord channels clean and preventing stale button errors.'
  },
  {
    icon: 'i-lucide-users',
    title: 'Silent Roster Mentions',
    description: 'Sign-ups display real user tags in the embed so players know who joined without spamming mass notifications across your server.'
  }
]

const steps = [
  {
    number: '01',
    title: 'Open with /lfg',
    description: 'Type /lfg in any Discord channel. A clean pop-up modal lets you set the dungeon, start time, your role, premade composition, and notes.'
  },
  {
    number: '02',
    title: 'Guild Members Claim Roles',
    description: 'The bot posts an interactive message embed. Players click Tank, Healer, or DPS to join immediately in one click.'
  },
  {
    number: '03',
    title: 'In-Place Live Updates',
    description: 'Every interaction updates the message in place. The roster automatically locks when full and safely cleans up when the key starts.'
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
  <div class="min-h-screen flex flex-col selection:bg-[#5865F2]/20 selection:text-[#5865F2]">
    <!-- Navigation Header -->
    <header class="sticky top-0 z-50 backdrop-blur-md bg-(--ui-bg)/80 border-b border-(--ui-border)">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-2.5 font-bold text-lg tracking-tight">
          <div class="w-8 h-8 rounded-lg bg-[#5865F2] flex items-center justify-center text-white shadow-sm">
            <UIcon name="i-lucide-swords" class="w-4 h-4" />
          </div>
          <span class="text-(--ui-text-highlighted)">mplus-lfg</span>
        </NuxtLink>

        <!-- Navigation Links -->
        <nav class="hidden md:flex items-center gap-6 text-sm text-(--ui-text-muted) font-medium">
          <NuxtLink to="/#features" class="hover:text-(--ui-text-highlighted) transition-colors">Features</NuxtLink>
          <NuxtLink to="/#how-it-works" class="hover:text-(--ui-text-highlighted) transition-colors">How It Works</NuxtLink>
          <NuxtLink to="/#syntax" class="hover:text-(--ui-text-highlighted) transition-colors">Composition Syntax</NuxtLink>
          <NuxtLink v-if="githubUrl" :to="githubUrl" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors">GitHub</NuxtLink>
        </nav>

        <!-- Header Actions -->
        <div class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :icon="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'"
            aria-label="Toggle Color Mode"
            @click="toggleColorMode"
          />

          <UButton
            :to="inviteUrl"
            :disabled="!inviteUrl"
            :title="inviteUrl ? undefined : 'Set NUXT_PUBLIC_DISCORD_APPLICATION_ID to enable this link'"
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
            class="bg-[#5865F2] hover:bg-[#4752C4] disabled:bg-[#5865F2] text-white disabled:text-white border-0"
            icon="i-simple-icons-discord"
          >
            Add to Discord
          </UButton>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1">
      <!-- Hero Section -->
      <section class="relative pt-16 pb-20 sm:pt-24 sm:pb-28 overflow-hidden">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <!-- Tagline Badge -->
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20 mb-6">
            <UIcon name="i-lucide-shield" class="w-3.5 h-3.5" />
            <span>Serverless Mythic+ Discord Bot</span>
          </div>

          <!-- Main Hero Headline -->
          <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight text-(--ui-text-highlighted) max-w-4xl mx-auto leading-tight sm:leading-none">
            Mythic+ Grouping, Built for Discord.
          </h1>

          <!-- Hero Subtitle -->
          <p class="mt-6 text-lg sm:text-xl text-(--ui-text-muted) max-w-2xl mx-auto leading-relaxed">
            Create runs with <code class="px-1.5 py-0.5 rounded bg-(--ui-bg-muted) text-(--ui-text-highlighted) font-mono text-base">/lfg</code>, auto-manage premades, and prevent double-booking with atomic transactions on Cloudflare Workers.
          </p>

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
            >
              Add to Discord
            </UButton>

            <UButton
              v-if="githubUrl"
              :to="githubUrl"
              target="_blank"
              rel="noopener noreferrer"
              size="xl"
              color="neutral"
              variant="subtle"
              class="w-full sm:w-auto"
              icon="i-simple-icons-github"
            >
              View on GitHub
            </UButton>
          </div>

          <!-- Interactive Discord Mockup -->
          <div class="mt-14 sm:mt-16">
            <div class="text-xs uppercase tracking-wider font-semibold text-(--ui-text-muted) mb-3">
              Interactive Live Preview
            </div>
            <DiscordMockup />
          </div>
        </div>
      </section>

      <!-- How It Works Section -->
      <section id="how-it-works" class="py-20 bg-(--ui-bg-elevated)/40 border-y border-(--ui-border)">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-14">
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              How it works
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              No separate web portals or third-party sign-ins. Everything happens inside your Discord server.
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

      <!-- Features Section -->
      <section id="features" class="py-20">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-14">
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              Built for speed and simplicity
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              Engineered from the ground up for seamless Discord interactions and zero maintenance overhead.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div
              v-for="feature in features"
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

      <!-- Syntax Guide Section -->
      <section id="syntax" class="py-20 bg-(--ui-bg-elevated)/40 border-t border-(--ui-border)">
        <div class="max-w-4xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-12">
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              Natural Composition Syntax
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              Specify full party comps or only what you need. Premades are calculated automatically without manual arithmetic.
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
            Supports <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">need</code>, <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">looking for</code>, <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">want</code>, and leading <code class="px-1 py-0.5 rounded bg-(--ui-bg-muted) font-mono">+</code> markers.
          </div>
        </div>
      </section>

      <!-- Bottom Call To Action Banner -->
      <section class="py-20 border-t border-(--ui-border)">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div class="p-8 sm:p-12 rounded-3xl bg-[#5865F2] text-white shadow-xl shadow-[#5865F2]/10 relative overflow-hidden">
            <div class="relative z-10 max-w-2xl mx-auto">
              <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Ready to organize your Mythic+ keys?
              </h2>
              <p class="mt-4 text-white/80 text-base sm:text-lg leading-relaxed">
                Add mplus-lfg to your Discord server in seconds. Free, open source, and serverless.
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
                >
                  Add to Discord
                </UButton>
                <UButton
                  v-if="githubUrl"
                  :to="githubUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xl"
                  variant="outline"
                  class="w-full sm:w-auto text-white border-white/40 hover:bg-white/10"
                  icon="i-simple-icons-github"
                >
                  GitHub Repository
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="border-t border-(--ui-border) py-10 bg-(--ui-bg)">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-(--ui-text-muted)">
        <div class="flex items-center gap-2">
          <div class="w-5 h-5 rounded bg-[#5865F2] flex items-center justify-center text-white text-[10px]">
            <UIcon name="i-lucide-swords" class="w-3 h-3" />
          </div>
          <span class="font-semibold text-(--ui-text-highlighted)">mplus-lfg</span>
          <span>• MIT License</span>
        </div>

        <div>
          World of Warcraft is a registered trademark of Blizzard Entertainment.
        </div>

        <div class="flex items-center gap-4">
          <NuxtLink v-if="githubUrl" :to="githubUrl" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors">
            GitHub
          </NuxtLink>
          <NuxtLink v-if="inviteUrl" :to="inviteUrl" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors">
            Invite Bot
          </NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>
