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
    title: 'Fast and out of the way',
    description: 'Runs right inside Discord, so your group can get organized without opening another site or waiting around.'
  },
  {
    icon: 'i-lucide-calculator',
    title: 'Flexible group setup',
    description: 'Type "LF 2 DPS", "1/1/3", or "LF1M tank" and the bot works out which spots are covered and which are still open.'
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'No double-booking',
    description: 'The moment someone claims the last open spot, it is taken. Everyone sees an accurate roster, even when several people click at once.'
  },
  {
    icon: 'i-lucide-clock',
    title: 'Times everyone understands',
    description: 'Say "in 30 mins" or "8:00 PM EST" and Discord shows the start time in each player\'s local timezone.'
  },
  {
    icon: 'i-lucide-sparkles',
    title: 'Keeps channels tidy',
    description: 'Finished and expired runs are cleared out automatically, so your channels stay useful and old buttons do not linger.'
  },
  {
    icon: 'i-lucide-users',
    title: 'Clear, quiet rosters',
    description: 'See exactly who joined each role without pinging the whole server.'
  }
]

const steps = [
  {
    number: '01',
    title: 'Start a group',
    description: 'Type /lfg in any Discord channel. Choose the dungeon, start time, your role, the spots you already have, and any notes.'
  },
  {
    number: '02',
    title: 'Players pick a spot',
    description: 'The bot posts the run with buttons for Tank, Healer, and DPS. Players click the role they want to join.'
  },
  {
    number: '03',
    title: 'Everyone stays up to date',
    description: 'The roster updates as people join, closes when the group is full, and cleans itself up when the run is over.'
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
          <NuxtLink to="/#syntax" class="hover:text-(--ui-text-highlighted) transition-colors">Group Examples</NuxtLink>
          <NuxtLink v-if="githubUrl" :to="githubUrl" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors" data-insightflare-event="github_link_click" data-insightflare-event-location="nav">GitHub</NuxtLink>
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
            data-insightflare-event="add_to_discord_click"
            data-insightflare-event-location="header"
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
            <span>Mythic+ Group Finder for Discord</span>
          </div>

          <!-- Main Hero Headline -->
          <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight text-(--ui-text-highlighted) max-w-4xl mx-auto leading-tight sm:leading-none">
            Mythic+ Grouping, Built for Discord.
          </h1>

          <!-- Hero Subtitle -->
          <p class="mt-6 text-lg sm:text-xl text-(--ui-text-muted) max-w-2xl mx-auto leading-relaxed">
            Create a run with <code class="px-1.5 py-0.5 rounded bg-(--ui-bg-muted) text-(--ui-text-highlighted) font-mono text-base">/lfg</code>, let mplus-lfg track open roles and timing, and fill your group with less back-and-forth.
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
              data-insightflare-event="add_to_discord_click"
              data-insightflare-event-location="hero"
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
              data-insightflare-event="github_link_click"
              data-insightflare-event-location="hero"
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

      <!-- Features Section -->
      <section id="features" class="py-20">
        <div class="max-w-6xl mx-auto px-4 sm:px-6">
          <div class="text-center max-w-2xl mx-auto mb-14">
            <h2 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">
              Spend less time organizing
            </h2>
            <p class="mt-3 text-(--ui-text-muted)">
              Fill a group, keep everyone on the same page, and keep your server tidy.
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
                Ready to organize your Mythic+ keys?
              </h2>
              <p class="mt-4 text-white/80 text-base sm:text-lg leading-relaxed">
                Add mplus-lfg to your Discord server in seconds. Free and open source, with everything happening where your group already plays.
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
                  v-if="githubUrl"
                  :to="githubUrl"
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
          <NuxtLink v-if="githubUrl" :to="githubUrl" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors" data-insightflare-event="github_link_click" data-insightflare-event-location="footer">
            GitHub
          </NuxtLink>
          <NuxtLink v-if="inviteUrl" :to="inviteUrl" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors" data-insightflare-event="add_to_discord_click" data-insightflare-event-location="footer">
            Invite Bot
          </NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>
