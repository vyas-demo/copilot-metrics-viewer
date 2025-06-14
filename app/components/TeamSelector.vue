<template>
  <div class="team-selector">
    <v-row>
      <v-col cols="auto">
        <span class="team-selector-label">Select Team:</span>
      </v-col>
      <v-col cols="auto">
        <v-select
          v-model="selectedTeam"
          :items="teamOptions"
          :loading="loading"
          :disabled="loading || teams.length === 0"
          label="Choose a team"
          item-title="name"
          item-value="slug"
          variant="outlined"
          density="compact"
          style="min-width: 200px;"
          clearable
          @update:model-value="onTeamSelected"
        >
          <template #no-data>
            <v-list-item>
              <v-list-item-title>{{ teams.length === 0 ? 'No teams available' : 'Loading teams...' }}</v-list-item-title>
            </v-list-item>
          </template>
        </v-select>
      </v-col>
    </v-row>
    
    <v-alert
      v-if="error"
      type="error"
      variant="text"
      density="compact"
      class="mt-2"
    >
      {{ error }}
    </v-alert>
  </div>
</template>

<script lang="ts" setup>
interface GitHubTeam {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

const emit = defineEmits<{
  teamSelected: [team: string | null]
}>();

const props = defineProps<{
  currentTeam?: string;
  show: boolean;
}>();

// Reactive data
const teams = ref<GitHubTeam[]>([]);
const selectedTeam = ref<string | null>(props.currentTeam || null);
const loading = ref(false);
const error = ref<string | null>(null);

// Computed
const teamOptions = computed(() => {
  const options = teams.value.map(team => ({
    name: `${team.name} (${team.slug})`,
    value: team.slug
  }));
  
  // Add "All Organization" option at the top
  return [
    { name: 'All Organization', value: null },
    ...options
  ];
});

// Watch for show prop changes to fetch teams
watch(() => props.show, (show) => {
  if (show) {
    fetchTeams();
  }
}, { immediate: true });

// Watch for currentTeam prop changes
watch(() => props.currentTeam, (newTeam) => {
  selectedTeam.value = newTeam || null;
});

async function fetchTeams() {
  if (!props.show) return;
  
  loading.value = true;
  error.value = null;
  
  try {
    const teamsData = await $fetch('/api/teams');
    teams.value = teamsData || [];
  } catch (err) {
    error.value = 'Failed to fetch teams';
    console.error('Error fetching teams:', err);
  } finally {
    loading.value = false;
  }
}

function onTeamSelected(team: string | null) {
  emit('teamSelected', team);
}
</script>

<style scoped>
.team-selector {
  padding: 16px;
  background-color: rgba(63, 81, 181, 0.1);
  border-radius: 4px;
  margin-bottom: 16px;
}

.team-selector-label {
  font-weight: 500;
  color: rgba(0, 0, 0, 0.87);
  line-height: 40px;
}
</style>