<script setup lang="ts">
useHead({
  title: 'Privacy Policy | mplus-lfg'
})

const sections = [
  {
    title: 'What we collect',
    body: [
      'When you use /lfg or click a role button, mplus-lfg stores only what it needs to run the group finder: the Discord server (guild) ID, channel ID, and message ID for the run, plus the user ID and username of the run creator and anyone who signs up.',
      'It also stores the content you type into the command, such as the activity, start time, notes, and group composition, so the roster can be posted and updated.'
    ]
  },
  {
    title: 'What we do not collect',
    body: [
      'mplus-lfg does not read or store your regular Discord messages, does not collect emails or other personal information, does not track you across servers, and does not use analytics on your Discord activity.',
      'We do not sell or share your data with third parties.'
    ]
  },
  {
    title: 'How it is used',
    body: [
      'This data exists solely to operate the bot: posting and updating run rosters, enforcing role limits, and closing out runs after they start or expire. It is not used for anything else.'
    ]
  },
  {
    title: 'Removing your data',
    body: [
      'Removing mplus-lfg from your server stops any further collection for that server. To request removal of existing data, open an issue on GitHub.'
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
        Last updated August 19, 2026
      </p>
      <p class="mt-6 text-(--ui-text-muted) leading-relaxed">
        mplus-lfg only collects what it needs to make the group finder work, nothing more. This page explains exactly what that is.
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
