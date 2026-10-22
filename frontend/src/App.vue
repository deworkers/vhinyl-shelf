<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BarcodeScanner from './components/BarcodeScanner.vue';
import { useAuthStore } from './stores/auth';
import { useRecordsStore } from './stores/records';

const route = useRoute();
const router = useRouter();
const isSearchOpen = ref(false);
const quickQuery = ref('');
const showScanner = ref(false);
const auth = useAuthStore();
const records = useRecordsStore();
const logoutBusy = ref(false);
const logoutError = ref('');

async function logout() {
	logoutBusy.value = true;
	logoutError.value = '';
	try {
		await auth.logout();
		records.$reset();
		isSearchOpen.value = false;
		await router.replace('/login');
	} catch (err) {
		logoutError.value = err.message;
	} finally {
		logoutBusy.value = false;
	}
}

watch(
	() => route.query.q,
	(value) => {
		quickQuery.value = typeof value === 'string' ? value : '';
	},
	{ immediate: true },
);

watch(() => route.fullPath, () => {
	showScanner.value = false;
});

function toggleSearch() {
	isSearchOpen.value = !isSearchOpen.value;
}

function submitQuickSearch() {
	const query = quickQuery.value?.trim() || '';
	if (!query) return;
	router.push({
		path: '/search',
		query: { q: query },
	});
}

function onBarcodeDetected(barcode) {
	showScanner.value = false;
	quickQuery.value = barcode;
	submitQuickSearch();
}
</script>

<template>
	<div class="app-shell">
		<header class="topbar">
			<div
				class="topbar-inner"
				:class="{
					'search-active': isSearchOpen && route.name !== 'search',
				}">
				<router-link
					to="/"
					class="brand"
					aria-label="My Vinyl Shelf — на главную">
					<span
						class="brand-mark"
						aria-hidden="true">
						<span class="brand-mark-disc"></span>
					</span>
					<span class="brand-text">
						<span class="brand-title">Vinyl Shelf</span>
						<span class="brand-sub">личная коллекция</span>
					</span>
				</router-link>

				<div
					v-if="auth.user && route.name !== 'search'"
					class="search-wrap"
					:class="{ 'is-open': isSearchOpen }">
					<Transition name="search-reveal">
						<form
							v-if="isSearchOpen"
							class="quick-search"
							@submit.prevent="submitQuickSearch">
							<svg
								class="quick-search-icon"
								viewBox="0 0 24 24"
								aria-hidden="true">
								<path
									d="M10.5 3a7.5 7.5 0 015.95 12.07l4.24 4.24-1.42 1.42-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" />
							</svg>
							<input
								v-model.trim="quickQuery"
								autofocus
								aria-label="Поиск по альбому, исполнителю или штрихкоду"
								placeholder="Альбом, исполнитель или штрихкод…" />
							<button
								type="button"
								class="quick-scan"
								aria-label="Сканировать штрихкод"
								title="Сканировать штрихкод"
								@click="showScanner = true">
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path d="M3 5h2v14H3V5zm4 0h1v14H7V5zm3 0h3v14h-3V5zm5 0h1v14h-1V5zm3 0h3v14h-3V5z" fill="currentColor" />
								</svg>
							</button>
						</form>
					</Transition>
					<button
						class="icon-btn"
						type="button"
						@click="toggleSearch"
						:aria-label="
							isSearchOpen ? 'Закрыть поиск' : 'Открыть поиск'
						">
						<svg
							v-if="!isSearchOpen"
							viewBox="0 0 24 24"
							aria-hidden="true">
							<path
								d="M10.5 3a7.5 7.5 0 015.95 12.07l4.24 4.24-1.42 1.42-4.24-4.24A7.5 7.5 0 1110.5 3zm0 2a5.5 5.5 0 100 11 5.5 5.5 0 000-11z" />
						</svg>
						<svg
							v-else
							viewBox="0 0 24 24"
							aria-hidden="true">
							<path
								d="M6.4 5l12.6 12.6-1.4 1.4L5 6.4 6.4 5zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4z" />
						</svg>
					</button>
				</div>
				<nav v-if="auth.user" class="account-nav" aria-label="Аккаунт">
					<router-link v-if="auth.isAdmin" to="/admin">Пользователи</router-link>
					<router-link to="/account">{{ auth.user.username }}</router-link>
					<button type="button" :disabled="logoutBusy" @click="logout">Выйти</button>
				</nav>
			</div>
		</header>
		<main class="content">
			<p v-if="logoutError" class="account-error" role="alert">{{ logoutError }}</p>
			<router-view v-slot="{ Component }">
				<Transition
					name="page"
					mode="out-in">
					<component :is="Component" />
				</Transition>
			</router-view>
		</main>
		<BarcodeScanner
			v-if="showScanner"
			@close="showScanner = false"
			@detected="onBarcodeDetected" />
	</div>
</template>

<style scoped>
.app-shell {
	min-height: 100vh;
}

.topbar {
	position: sticky;
	top: 0;
	z-index: 30;
	background: color-mix(in srgb, var(--bg) 78%, transparent);
	backdrop-filter: saturate(160%) blur(14px);
	-webkit-backdrop-filter: saturate(160%) blur(14px);
	border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.topbar-inner {
	max-width: var(--container);
	margin: 0 auto;
	padding: 0.7rem 1.25rem;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	flex-wrap: wrap;
}

/* Бренд */
.brand {
	display: inline-flex;
	align-items: center;
	gap: 0.65rem;
	min-width: 0;
	flex: 0 1 auto;
}
.brand-mark {
	flex-shrink: 0;
}
.brand-mark {
	width: 38px;
	height: 38px;
	border-radius: 50%;
	background:
		radial-gradient(circle at 50% 50%, #fff 0 6px, transparent 7px),
		conic-gradient(
			from 0deg,
			#1f1a16 0 25%,
			#2a221b 25% 50%,
			#1f1a16 50% 75%,
			#2a221b 75%
		);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	box-shadow:
		inset 0 0 0 1px rgba(255, 255, 255, 0.06),
		var(--shadow-sm);
	position: relative;
	overflow: hidden;
}
.brand-mark::after {
	content: '';
	position: absolute;
	inset: 7px;
	border-radius: 50%;
	background: var(--accent);
	box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85);
}
.brand-mark-disc {
	position: absolute;
	inset: 14px;
	border-radius: 50%;
	background: #fff;
	z-index: 2;
}
.brand-text {
	display: grid;
	line-height: 1.05;
	min-width: 0;
}
.brand-title {
	font-family: var(--font-display);
	font-weight: 700;
	font-size: 1.15rem;
	color: var(--text);
	letter-spacing: -0.01em;
	white-space: nowrap;
}
.brand-sub {
	font-size: 0.72rem;
	color: var(--text-muted);
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

/* Поиск в топбаре */
.search-wrap {
	position: relative;
	display: inline-flex;
	align-items: center;
	justify-content: flex-end;
	gap: 0.5rem;
	flex: 0 0 auto;
	min-width: 0;
}
.topbar-inner.search-active .search-wrap {
	flex: 1 1 auto;
	min-width: 0;
}
.topbar-inner.search-active .account-nav {
	flex-basis: 100%;
}

.icon-btn {
	flex: 0 0 auto;
	border: 1px solid var(--border);
	width: 42px;
	height: 42px;
	border-radius: var(--radius-pill);
	background: var(--bg-elevated);
	color: var(--text);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition:
		background var(--transition),
		color var(--transition),
		transform var(--transition),
		border-color var(--transition);
	box-shadow: var(--shadow-xs);
}
.icon-btn:hover {
	background: var(--accent);
	color: var(--text-on-accent);
	border-color: var(--accent);
	transform: translateY(-1px);
}
.icon-btn:active {
	transform: translateY(0);
}
.icon-btn svg {
	width: 18px;
	height: 18px;
	fill: currentColor;
}

.quick-search {
	position: relative;
	display: flex;
	align-items: center;
	flex: 1 1 auto;
	min-width: 0;
	max-width: 420px;
}
.quick-search-icon {
	position: absolute;
	left: 14px;
	width: 16px;
	height: 16px;
	fill: var(--text-muted);
	pointer-events: none;
}
.quick-search input {
	width: 100%;
	min-width: 0;
	height: 42px;
	border: 1px solid var(--border);
	border-radius: var(--radius-pill);
	padding: 0 3rem 0 2.4rem;
	background: var(--bg-elevated);
	color: var(--text);
	box-shadow: var(--shadow-sm);
	transition:
		border-color var(--transition),
		box-shadow var(--transition);
}
.quick-search input::placeholder {
	color: var(--text-subtle);
}
.quick-search input:focus {
	border-color: var(--accent);
	box-shadow: var(--ring-accent);
	outline: none;
}
.quick-scan {
	position: absolute;
	right: 4px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 34px;
	height: 34px;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: transparent;
	color: var(--text-muted);
	cursor: pointer;
}
.quick-scan:hover {
	background: var(--accent-soft);
	color: var(--accent);
}
.quick-scan svg {
	width: 20px;
	height: 20px;
}

.search-reveal-enter-active,
.search-reveal-leave-active {
	transition:
		opacity var(--transition),
		transform var(--transition);
}
.search-reveal-enter-from,
.search-reveal-leave-to {
	opacity: 0;
	transform: translateX(8px);
}

.content {
	max-width: var(--container);
	margin: 0 auto;
	padding: 1.5rem 1.25rem 4rem;
}

/* Анимация смены страниц */
.page-enter-active,
.page-leave-active {
	transition:
		opacity 220ms ease,
		transform 220ms ease;
}
.page-enter-from {
	opacity: 0;
	transform: translateY(6px);
}
.page-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}

@media (max-width: 640px) {
	.topbar-inner {
		padding: 0.6rem 0.9rem;
		gap: 0.5rem;
	}
	.brand-sub {
		display: none;
	}
	.brand-title {
		font-size: 1.05rem;
	}
	.icon-btn {
		width: 40px;
		height: 40px;
	}
	.quick-search input {
		height: 40px;
	}
	.content {
		padding: 1rem 0.9rem 3rem;
	}

	/* При открытом поиске прячем текст бренда — остаётся только знак */
	.topbar-inner.search-active .brand-text {
		display: none;
	}
}
</style>
