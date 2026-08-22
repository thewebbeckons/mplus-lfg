<script setup lang="ts">
useHead({
  title: `Privacy Policy | ${BRAND.name}`
})

const sections = [
  {
    title: 'What we collect',
    body: [
      `When you use /lfg or click a role button, ${BRAND.name} stores only what it needs to run the group finder: the Discord server (guild) ID, channel ID, and message ID for the run, plus the user ID and username of the run creator and anyone who signs up.`,
      'It also stores the content you type into the command, such as the activity, start time, notes, and group composition, so the roster can be posted and updated.',
      'When you use /craft, it stores the same kind of identifiers for the request — server, channel, and message ID, plus the user ID and display name of the requester and of whichever crafter claims it — along with what you typed: the Wowhead item link, quantity, the character and realm if you supplied one, and any request details.',
      'For crafting requests it also stores the item name, quality, and icon returned by Blizzard’s official World of Warcraft Game Data API, looked up by item ID. Only that numeric item ID is ever sent to Blizzard. Nothing about you or your server is.'
    ]
  },
  {
    title: 'What we do not collect',
    body: [
      `${BRAND.name} does not read or store your regular Discord messages, does not collect emails or other personal information, does not track you across servers, and does not use analytics on your Discord activity.`,
      'We do not sell or share your data with third parties.'
    ]
  },
  {
    title: 'How it is used',
    body: [
      'This data exists solely to operate the bot: posting and updating run rosters, enforcing role limits, closing out runs after they start or expire, and tracking crafting requests from open through claimed to completed.'
    ]
  },
  {
    title: 'Direct messages',
    body: [
      'When a crafter marks your request complete, the bot sends you one direct message telling you the item, the quantity, who made it, and a link back to the original request. That is the only message it will ever send you outside a server channel.',
      'If your Discord settings do not allow direct messages from server members, the bot cannot DM you. In that case it posts a single short mention in the crafting channel instead, so the completion is not lost. That fallback is visible to anyone who can read the channel.',
      'The bot records only whether the notification succeeded, failed, or fell back — never the contents of any conversation.'
    ]
  },
  {
    title: 'How long we keep it',
    body: [
      'Run data is deleted automatically about 24 hours after the run’s scheduled start time — or after it was posted, for runs where the start time could not be read. Deleting a run removes its roster with it, including the user IDs, usernames, and anything typed into the notes.',
      'Crafting requests are kept longer, because they wait on someone logging in with the right profession: an unfinished request expires after 14 days, and every request is deleted about 30 days after it was posted, whatever its state. Deleting a request removes the user IDs, display names, character name, and request details with it.',
      'The only thing kept beyond that is your server’s setup: the LFG channel, the crafting channel, the timezone, and the crafter role chosen with /setup. That contains no personal information and stays until it is changed or removed.'
    ]
  },
  {
    title: 'Removing your data',
    body: [
      `Removing ${BRAND.name} from your server stops any further collection for that server, and any runs or crafting requests still on file age out as described above. To request removal of your server’s setup, open an issue on GitHub.`
    ]
  },
  {
    title: 'Changes to this policy',
    body: [
      'If this policy changes, the update will be posted on this page.'
    ]
  }
]
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
    <div class="mb-12">
      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-(--ui-text-highlighted)">
        Privacy Policy
      </h1>
      <p class="mt-3 text-sm text-(--ui-text-muted)">
        Last updated August 22, 2026
      </p>
      <p class="mt-6 text-(--ui-text-muted) leading-relaxed">
        {{ BRAND.name }} only collects what it needs to make its features work, nothing more. This page explains exactly what that is.
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
