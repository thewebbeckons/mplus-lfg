<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * A crafting request as it moves through its three states. Deliberately the
 * same visual language as DiscordMockup — same chrome, same palette, same
 * button treatment — so the two feature sections read as one product.
 */
type CraftState = 'OPEN' | 'CLAIMED' | 'COMPLETED'

const state = ref<CraftState>('OPEN')

const STATES: { value: CraftState, label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CLAIMED', label: 'Claimed' },
  { value: 'COMPLETED', label: 'Completed' }
]

const META: Record<CraftState, { emoji: string, label: string, accent: string, text: string }> = {
  OPEN: { emoji: '🧵', label: 'Open', accent: '#3b82f6', text: '#7f9cf5' },
  CLAIMED: { emoji: '🔨', label: 'In progress', accent: '#f59e0b', text: '#f0b232' },
  COMPLETED: { emoji: '✅', label: 'Completed', accent: '#22c55e', text: '#23a55a' }
}

const meta = computed(() => META[state.value])
const claimed = computed(() => state.value !== 'OPEN')
const completed = computed(() => state.value === 'COMPLETED')
</script>

<template>
  <div class="w-full max-w-xl mx-auto rounded-xl bg-[#313338] text-[#dbdee1] p-4 sm:p-5 font-sans shadow-2xl border border-[#3f4147] select-none text-left">
    <!-- Discord Bot Header / Message metadata -->
    <div class="flex items-center gap-3 mb-3">
      <div class="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white shrink-0 shadow">
        <UIcon name="i-lucide-hammer" class="w-5 h-5" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="font-semibold text-white text-sm sm:text-base">{{ BRAND.name }}</span>
          <span class="bg-[#5865F2] text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">APP</span>
          <span class="text-xs text-[#949ba4]">Today at 7:12 PM</span>
        </div>
        <div class="text-xs text-[#949ba4]">posted a crafting request</div>
      </div>
    </div>

    <!-- Embed Container -->
    <div
      class="rounded border-l-4 bg-[#2b2d31] p-3 sm:p-4 text-sm space-y-3 transition-colors"
      :style="{ borderLeftColor: meta.accent }"
    >
      <!-- Title with item icon -->
      <div class="flex items-start justify-between gap-3">
        <div class="font-bold text-white text-base sm:text-lg flex items-center gap-1.5">
          <span>{{ meta.emoji }}</span>
          <span>Chromebustible Bomb Suit ×2</span>
        </div>
        <div class="w-11 h-11 shrink-0 rounded border border-[#4e5058] bg-[#1e1f22] flex items-center justify-center text-[#f0b232]">
          <UIcon name="i-lucide-shirt" class="w-6 h-6" />
        </div>
      </div>

      <!-- Description Block -->
      <div class="text-xs sm:text-sm space-y-1 text-[#dbdee1] leading-relaxed">
        <div>
          <strong class="text-[#b5bac1]">Status</strong>
          <span class="font-medium ml-1" :style="{ color: meta.text }">{{ meta.emoji }} {{ meta.label }}</span>
        </div>
        <div><strong class="text-[#b5bac1]">Requested by</strong> <span class="text-[#5865f2] bg-[#5865f2]/10 px-1 py-0.5 rounded font-medium">@Jesse</span></div>
        <div v-if="claimed"><strong class="text-[#b5bac1]">Crafter</strong> <span class="text-[#5865f2] bg-[#5865f2]/10 px-1 py-0.5 rounded font-medium">@Mira</span></div>
        <div v-if="completed"><strong class="text-[#b5bac1]">Completed</strong> <span class="text-[#949ba4]">just now</span></div>
      </div>

      <!-- Fields -->
      <div class="grid grid-cols-2 gap-3 pt-2 border-t border-[#35373c]">
        <div class="space-y-1">
          <div class="font-semibold text-xs text-[#f2f3f5]">Quantity</div>
          <div class="text-xs font-mono text-[#dbdee1]">×2</div>
        </div>
        <div class="space-y-1">
          <div class="font-semibold text-xs text-[#f2f3f5]">Character</div>
          <div class="text-xs font-mono text-[#dbdee1]">Ashwynn — Area 52</div>
        </div>
      </div>

      <div class="space-y-1">
        <div class="font-semibold text-xs text-[#f2f3f5]">Request details</div>
        <div class="text-xs text-[#949ba4] leading-relaxed">
          Rank 3 if you can manage it, embellished. I have the mats, happy to tip 10k. Needed before raid Thursday.
        </div>
      </div>

      <!-- Footer -->
      <div class="text-[11px] text-[#80848e] pt-1 flex items-center justify-between border-t border-[#35373c]/50">
        <span>Request a1b2c3d4</span>
        <span class="text-[10px]">Switch states to see the buttons change</span>
      </div>
    </div>

    <!-- Action Row (Discord Buttons) -->
    <div class="flex flex-wrap gap-2 mt-3 min-h-8">
      <button
        v-if="state === 'OPEN'"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#23a55a] hover:bg-[#1f9350] text-white cursor-pointer active:scale-95 transition-colors"
        @click="state = 'CLAIMED'"
      >
        <span>🔨</span>
        <span>I'll craft it</span>
      </button>

      <button
        v-if="state === 'CLAIMED'"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#5865F2] hover:bg-[#4752C4] text-white cursor-pointer active:scale-95 transition-colors"
        @click="state = 'COMPLETED'"
      >
        <span>✅</span>
        <span>Mark complete</span>
      </button>

      <button
        v-if="state === 'CLAIMED'"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#4e5058] hover:bg-[#6d6f78] text-white cursor-pointer active:scale-95 transition-colors"
        @click="state = 'OPEN'"
      >
        <span>↩️</span>
        <span>Release claim</span>
      </button>

      <button
        v-if="!completed"
        disabled
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#da373c]/20 text-[#f23f43] opacity-60 cursor-not-allowed"
      >
        <span>❌</span>
        <span>Cancel request</span>
      </button>

      <!-- Link-style button, present in every state -->
      <span class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-transparent border border-[#4e5058] text-[#dbdee1]">
        <span>View on Wowhead</span>
        <UIcon name="i-lucide-external-link" class="w-3 h-3" />
      </span>
    </div>

    <!-- Completion DM preview -->
    <div v-if="completed" class="mt-3 rounded bg-[#2b2d31] border border-[#3f4147] p-3 text-xs text-[#dbdee1]">
      <div class="text-[10px] uppercase tracking-wider font-semibold text-[#949ba4] mb-1.5">
        Direct message to @Jesse
      </div>
      <div class="leading-relaxed">
        ✅ <strong class="text-white">Your crafting request is done!</strong><br>
        <span class="text-[#949ba4]">Chromebustible Bomb Suit ×2 · crafted by Mira · for Ashwynn — Area 52</span>
      </div>
    </div>

    <!-- State switcher -->
    <div class="flex items-center gap-2 mt-4 pt-3 border-t border-[#3f4147]">
      <span class="text-[10px] uppercase tracking-wider font-semibold text-[#949ba4]">State</span>
      <button
        v-for="option in STATES"
        :key="option.value"
        class="px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer"
        :class="state === option.value
          ? 'bg-[#5865F2] text-white'
          : 'bg-[#3f4147] text-[#b5bac1] hover:bg-[#4e5058]'"
        @click="state = option.value"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
