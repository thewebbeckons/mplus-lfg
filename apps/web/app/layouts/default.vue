<script setup lang="ts">
const colorMode = useColorMode()
const config = useRuntimeConfig()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const inviteUrl = config.public.discordApplicationId
  ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(config.public.discordApplicationId)}&scope=bot%20applications.commands&permissions=19456&integration_type=0`
  : undefined
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
          <NuxtLink :to="GITHUB_URL" external target="_blank" rel="noopener noreferrer" class="hover:text-(--ui-text-highlighted) transition-colors" data-insightflare-event="github_link_click" data-insightflare-event-location="nav">GitHub</NuxtLink>
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
      <slot />
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
          <NuxtLink to="/privacy" class="hover:text-(--ui-text-highlighted) transition-colors">Privacy Policy</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-(--ui-text-highlighted) transition-colors">Terms of Service</NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>
