<script setup lang="ts">
useHead({
  title: `Terms of Service | ${BRAND.name}`
})

const sections = [
  {
    title: 'Using the bot',
    body: [
      `${BRAND.name} is a free Discord bot for World of Warcraft guilds. It organizes Mythic+ groups and tracks crafting requests. By adding it to your server or using its commands, you agree to these terms.`,
      'You must comply with Discord\'s own Terms of Service and Community Guidelines while using the bot.'
    ]
  },
  {
    title: 'Crafting requests are between you and your guild',
    body: [
      'A crafting request is a note in your Discord server, nothing more. The bot does not handle gold, materials, trades, or delivery, and marking a request complete is simply the crafter saying they are done.',
      'Any arrangement about tips, materials, or deadlines is between the people involved. The maintainers are not a party to it and cannot arbitrate it.'
    ]
  },
  {
    title: 'No warranty',
    body: [
      'The bot is provided "as is," with no guarantee of uptime, accuracy, or fitness for any particular purpose. Runs, rosters, crafting requests, item information, timing, and completion notifications may occasionally be delayed, incorrect, undelivered, or lost.',
      'Item names, qualities, and icons come from Blizzard\'s official World of Warcraft Game Data API and may be missing or out of date. World of Warcraft and Wowhead are not affiliated with this project.'
    ]
  },
  {
    title: 'Limitation of liability',
    body: [
      `The maintainers are not liable for any damages or losses arising from the use of, or inability to use, ${BRAND.name}.`
    ]
  },
  {
    title: 'Free to use, free to fork',
    body: [
      `${BRAND.name} is free to use and open source under the MIT License. You are free to fork, self-host, modify, or redistribute it, subject to that license.`
    ]
  },
  {
    title: 'Availability and changes',
    body: [
      'The bot may be changed, limited, or discontinued at any time, without notice. You can remove the bot from your server at any time.'
    ]
  },
  {
    title: 'Changes to these terms',
    body: [
      'If these terms change, the update will be posted on this page.'
    ]
  }
]
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
    <div class="mb-12">
      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-(--ui-text-highlighted)">
        Terms of Service
      </h1>
      <p class="mt-3 text-sm text-(--ui-text-muted)">
        Last updated August 22, 2026
      </p>
      <p class="mt-6 text-(--ui-text-muted) leading-relaxed">
        Simple terms for a simple, free bot. See the <NuxtLink to="/privacy" class="text-[#5865F2] hover:underline">Privacy Policy</NuxtLink> for what data {{ BRAND.name }} collects.
      </p>
    </div>

    <div class="space-y-10">
      <section
        v-for="section in sections"
        :key="section.title"
        class="p-6 rounded-2xl bg-(--ui-bg) border border-(--ui-border) shadow-sm"
      >
        <h2 class="text-lg font-bold text-(--ui-text-highlighted) mb-3">
          {{ section.title }}
        </h2>
        <p
          v-for="paragraph in section.body"
          :key="paragraph"
          class="text-sm text-(--ui-text-muted) leading-relaxed mt-2 first:mt-0"
        >
          {{ paragraph }}
        </p>
      </section>
    </div>

    <p class="mt-12 text-sm text-(--ui-text-muted)">
      Questions? <NuxtLink :to="GITHUB_URL" external target="_blank" rel="noopener noreferrer" class="text-[#5865F2] hover:underline">Open an issue on GitHub</NuxtLink>.
    </p>
  </div>
</template>
