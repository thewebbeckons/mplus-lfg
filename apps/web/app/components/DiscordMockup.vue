<script setup lang="ts">
import { ref, computed } from 'vue'

const userRole = ref<'TANK' | 'HEALER' | 'DPS' | null>(null)

const tankCount = computed(() => 1) // Tank is locked by Leader @Jesse
const healerJoined = computed(() => userRole.value === 'HEALER')
const dpsJoined = computed(() => userRole.value === 'DPS')
const healerCount = computed(() => healerJoined.value ? 1 : 0)
const dpsCount = computed(() => 2 + (dpsJoined.value ? 1 : 0)) // 1 player + 1 premade + optional user

const totalFilled = computed(() => tankCount.value + healerCount.value + dpsCount.value)
const isFull = computed(() => totalFilled.value >= 5)

function join(role: 'HEALER' | 'DPS') {
  userRole.value = role
}

function leave() {
  userRole.value = null
}

function reset() {
  userRole.value = null
}
</script>

<template>
  <div class="w-full max-w-xl mx-auto rounded-xl bg-[#313338] text-[#dbdee1] p-4 sm:p-5 font-sans shadow-2xl border border-[#3f4147] select-none text-left">
    <!-- Discord Bot Header / Message metadata -->
    <div class="flex items-center gap-3 mb-3">
      <div class="w-10 h-10 rounded-full bg-[#5865F2] flex items-center justify-center text-white shrink-0 shadow">
        <UIcon name="i-lucide-swords" class="w-5 h-5" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <span class="font-semibold text-white text-sm sm:text-base">mplus-lfg</span>
          <span class="bg-[#5865F2] text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">APP</span>
          <span class="text-xs text-[#949ba4]">Today at 8:05 PM</span>
        </div>
        <div class="text-xs text-[#949ba4]">organized a Mythic+ dungeon run</div>
      </div>
    </div>

    <!-- Embed Container -->
    <div class="rounded border-l-4 border-l-[#23a55a] bg-[#2b2d31] p-3 sm:p-4 text-sm space-y-3">
      <!-- Title -->
      <div class="font-bold text-white text-base sm:text-lg flex items-center gap-1.5">
        <span>🟢</span>
        <span>[+12] Grim Batol</span>
      </div>

      <!-- Description Block -->
      <div class="text-xs sm:text-sm space-y-1 text-[#dbdee1] leading-relaxed">
        <div><strong class="text-[#b5bac1]">When</strong> <span class="bg-[#383a40] px-1 py-0.5 rounded text-white font-mono text-xs">Today at 8:30 PM (in 25m)</span></div>
        <div><strong class="text-[#b5bac1]">Leader</strong> <span class="text-[#5865f2] bg-[#5865f2]/10 px-1 py-0.5 rounded font-medium">@Jesse</span></div>
        <div>
          <strong class="text-[#b5bac1]">Status</strong>
          <span v-if="isFull" class="text-[#23a55a] font-medium ml-1">🟢 FULL · 5/5 filled</span>
          <span v-else class="text-[#23a55a] font-medium ml-1">🟢 OPEN · {{ totalFilled }}/5 filled</span>
        </div>
        <div class="border-l-2 border-[#4e5058] pl-2 text-[#949ba4] italic text-xs mt-1">
          2.8k+ io push, please bring invis pots & phials
        </div>
      </div>

      <!-- Roster Fields (3 columns) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#35373c]">
        <!-- Tank -->
        <div class="space-y-1">
          <div class="font-semibold text-xs text-[#f2f3f5] flex items-center gap-1">
            <span>🛡️</span>
            <span>Tank {{ tankCount }}/1</span>
          </div>
          <div class="text-xs font-mono">
            <span class="text-[#5865f2] bg-[#5865f2]/15 px-1 py-0.5 rounded">@Jesse</span>
          </div>
        </div>

        <!-- Healer -->
        <div class="space-y-1">
          <div class="font-semibold text-xs text-[#f2f3f5] flex items-center gap-1">
            <span>💚</span>
            <span>Healer {{ healerCount }}/1</span>
          </div>
          <div class="text-xs font-mono">
            <span v-if="healerJoined" class="text-[#23a55a] bg-[#23a55a]/15 px-1 py-0.5 rounded font-semibold">@You (Healer)</span>
            <span v-else class="text-[#80848e] bg-[#313338] px-1 py-0.5 rounded">— open —</span>
          </div>
        </div>

        <!-- DPS -->
        <div class="space-y-1">
          <div class="font-semibold text-xs text-[#f2f3f5] flex items-center gap-1">
            <span>⚔️</span>
            <span>DPS {{ dpsCount }}/3</span>
          </div>
          <div class="text-xs font-mono space-y-1 flex flex-col items-start">
            <span class="text-[#5865f2] bg-[#5865f2]/15 px-1 py-0.5 rounded">@Alex</span>
            <span class="text-[#80848e] bg-[#313338] px-1 py-0.5 rounded">— premade —</span>
            <span v-if="dpsJoined" class="text-[#f23f43] bg-[#f23f43]/15 px-1 py-0.5 rounded font-semibold">@You (DPS)</span>
            <span v-else class="text-[#80848e] bg-[#313338] px-1 py-0.5 rounded">— open —</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="text-[11px] text-[#80848e] pt-1 flex items-center justify-between border-t border-[#35373c]/50">
        <span>Roster updates as players join</span>
        <span class="text-[10px]">Click a role to try it</span>
      </div>
    </div>

    <!-- Action Row (Discord Buttons) -->
    <div class="flex flex-wrap gap-2 mt-3">
      <!-- Tank Button (Full) -->
      <button
        disabled
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#5865F2] text-white opacity-50 cursor-not-allowed"
      >
        <span>🛡️</span>
        <span>Tank</span>
      </button>

      <!-- Healer Button -->
      <button
        :disabled="healerJoined || isFull"
        @click="join('HEALER')"
        :class="[
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
          healerJoined || isFull
            ? 'bg-[#23a55a] text-white opacity-50 cursor-not-allowed'
            : 'bg-[#23a55a] hover:bg-[#1f9350] text-white cursor-pointer active:scale-95'
        ]"
      >
        <span>💚</span>
        <span>Healer</span>
      </button>

      <!-- DPS Button -->
      <button
        :disabled="dpsJoined || isFull"
        @click="join('DPS')"
        :class="[
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
          dpsJoined || isFull
            ? 'bg-[#4e5058] text-[#dbdee1] opacity-50 cursor-not-allowed'
            : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white cursor-pointer active:scale-95'
        ]"
      >
        <span>⚔️</span>
        <span>DPS</span>
      </button>

      <!-- Leave Button -->
      <button
        :disabled="!userRole"
        @click="leave"
        :class="[
          'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
          !userRole
            ? 'bg-[#4e5058] text-[#dbdee1] opacity-50 cursor-not-allowed'
            : 'bg-[#4e5058] hover:bg-[#6d6f78] text-white cursor-pointer active:scale-95'
        ]"
      >
        <span>🚪</span>
        <span>Leave</span>
      </button>

      <!-- Reset / Cancel Demo Button -->
      <button
        @click="reset"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#da373c]/20 hover:bg-[#da373c] text-[#f23f43] hover:text-white transition-colors cursor-pointer ml-auto"
        title="Reset interactive preview"
      >
        <span>🔄</span>
        <span class="hidden sm:inline">Reset Demo</span>
      </button>
    </div>
  </div>
</template>
