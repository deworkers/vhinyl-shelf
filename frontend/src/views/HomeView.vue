<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { storeToRefs } from 'pinia';
import { useRecordsStore } from '../stores/records';
import VinylGrid from '../components/VinylGrid.vue';

const store = useRecordsStore();
const auth = useAuthStore();
const route = useRoute();
const error = ref('');
const ownerId = computed(() => auth.isAdmin && route.query.user_id ? String(route.query.user_id) : null);
const { records, statusFilter, loading } = storeToRefs(store);

const filters = [
    { value: 'my_collection', label: 'Моя коллекция' },
    { value: 'want_to_buy', label: 'Хочу купить' },
];

const heroTitle = computed(() =>
    statusFilter.value === 'my_collection'
        ? ownerId.value ? 'Коллекция пользователя' : 'Ваша коллекция'
        : 'Список желаний',
);
const totalCount = computed(() => records.value?.length || 0);

function setStatus(value) {
    statusFilter.value = value;
}

watch([statusFilter, ownerId], async () => {
    error.value = '';
    store.records = [];
    try {
        await store.fetchRecords(ownerId.value);
    } catch (err) {
        error.value = err.message;
    }
}, { immediate: true });
</script>

<template>
    <section class="home">
        <aside v-if="ownerId" class="collection-context">
            <span>Коллекция: {{ route.query.username || `пользователь #${ownerId}` }}</span>
            <router-link to="/">Моя коллекция</router-link>
        </aside>
        <p v-if="error" class="account-error" role="alert">{{ error }}</p>
        <header class="hero">
            <h1>{{ heroTitle }}</h1>

            <div
                class="segmented"
                role="tablist"
                :aria-label="'Фильтр коллекции'">
                <button
                    v-for="option in filters"
                    :key="option.value"
                    role="tab"
                    :aria-selected="statusFilter === option.value"
                    :class="{ active: statusFilter === option.value }"
                    @click="setStatus(option.value)">
                    {{ option.label }}
                </button>
            </div>
        </header>

        <div
            v-if="!loading && records.length"
            class="counter">
            {{ totalCount }}
            {{
                totalCount === 1
                    ? 'релиз'
                    : totalCount % 10 >= 2 &&
                        totalCount % 10 <= 4 &&
                        Math.floor(totalCount / 10) % 10 !== 1
                      ? 'релиза'
                      : 'релизов'
            }}
        </div>

        <div
            v-if="loading"
            class="state">
            <div class="spinner"></div>
            <span>Загружаем коллекцию…</span>
        </div>

        <div
            v-else-if="!records.length"
            class="empty">
            <div
                class="empty-art"
                aria-hidden="true">
                <div class="vinyl-illustration">
                    <div class="vinyl-disc">
                        <div class="vinyl-label"></div>
                    </div>
                </div>
            </div>
            <h2>Здесь пока пусто</h2>
            <p>
                Найдите первую пластинку через поиск в шапке — или добавьте
                вручную из карточки результатов.
            </p>
            <router-link
                to="/search"
                class="primary-btn">
                Открыть поиск
            </router-link>
        </div>

        <VinylGrid
            v-else
            :records="records" />
    </section>
</template>

<style scoped>
.home {
    display: grid;
    gap: 1.5rem;
}

/* Hero */
.hero {
    display: grid;
    gap: 1rem;
}
.hero h1 {
    font-size: clamp(1.6rem, 3.4vw, 2.1rem);
    margin: 0;
    font-family: var(--font-display);
    line-height: 1.1;
}

/* Сегментированный фильтр */
.segmented {
    display: inline-flex;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 4px;
    width: max-content;
    gap: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
.segmented button {
    border: 0;
    background: transparent;
    border-radius: var(--radius-pill);
    padding: 0.55rem 1rem;
    cursor: pointer;
    font-weight: 500;
    color: var(--text-muted);
    transition:
        color var(--transition),
        background var(--transition),
        box-shadow var(--transition);
    white-space: nowrap;
}
.segmented button:hover {
    color: var(--text);
}
.segmented button.active {
    background: var(--bg-elevated);
    color: var(--text);
    box-shadow: var(--shadow-sm);
}

/* Счётчик */
.counter {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-top: -0.5rem;
}

/* Состояния */
.state {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--text-muted);
    padding: 1rem;
}
.spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
}
@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.empty {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    text-align: center;
    background: var(--bg-elevated);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    padding: 3rem 1.5rem;
}
.empty h2 {
    margin: 0;
    font-size: 1.4rem;
}
.empty p {
    margin: 0;
    color: var(--text-muted);
    max-width: 42ch;
}

.empty-art {
    width: 96px;
    height: 96px;
    display: grid;
    place-items: center;
}
.vinyl-illustration {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background:
        repeating-radial-gradient(circle, #1f1a16 0 1px, #2a221b 1px 4px),
        #1f1a16;
    display: grid;
    place-items: center;
    box-shadow: var(--shadow-md);
    animation: spin 8s linear infinite;
}
.vinyl-disc {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent);
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.7);
}
.vinyl-label {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fff;
}

/* Primary кнопка */
.primary-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--text-on-accent);
    border-radius: var(--radius-pill);
    padding: 0.65rem 1.25rem;
    font-weight: 600;
    box-shadow: var(--shadow-sm);
    transition:
        background var(--transition),
        transform var(--transition),
        box-shadow var(--transition);
}
.primary-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}

@media (max-width: 640px) {
    .hero {
        padding: 1.25rem;
    }
    .segmented button {
        padding: 0.5rem 0.85rem;
        font-size: 0.92rem;
    }
}
</style>
