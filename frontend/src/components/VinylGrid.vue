<script setup>
function releaseYear(record) {
	if (!record?.year) return '';
	return String(record.year).slice(0, 4);
}

function getRating(record) {
	try {
		const payload = record?.payload_json
			? JSON.parse(record.payload_json)
			: null;
		const average = payload?.community?.rating?.average;
		if (typeof average !== 'number') return null;
		return average.toFixed(1);
	} catch {
		return null;
	}
}

defineProps({
	records: {
		type: Array,
		default: () => [],
	},
});
</script>

<template>
	<div class="grid">
		<router-link
			v-for="record in records"
			:key="record.id"
			class="tile"
			:to="`/release/${record.id}`">
			<div class="cover-wrap">
				<div
					class="vinyl-behind"
					aria-hidden="true">
					<div class="vinyl-label"></div>
				</div>
				<img
					:src="record.cover_url || '/placeholder-cover.svg'"
					:alt="record.title"
					loading="lazy"
					decoding="async" />
				<span
					v-if="getRating(record)"
					class="rating-badge">
					★ {{ getRating(record) }}
				</span>
			</div>
			<div class="meta">
				<strong class="artist">{{ record.artist }}</strong>
				<span class="title">{{ record.title }}</span>
				<small
					v-if="releaseYear(record)"
					class="year">
					{{ releaseYear(record) }}
				</small>
			</div>
		</router-link>
	</div>
</template>

<style scoped>
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 1.1rem;
}

.tile {
	display: grid;
	gap: 0.6rem;
	color: var(--text);
	border-radius: var(--radius-md);
	transition: transform var(--transition);
}
.tile:hover {
	transform: translateY(-2px);
}

.cover-wrap {
	position: relative;
	aspect-ratio: 1;
	border-radius: var(--radius-md);
	overflow: hidden;
	background: var(--bg-subtle);
	box-shadow: var(--shadow-sm);
	transition:
		box-shadow var(--transition),
		transform var(--transition);
}
.tile:hover .cover-wrap {
	box-shadow: var(--shadow-lg);
}

.cover-wrap img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	transition: transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
	position: relative;
	z-index: 2;
}
.tile:hover .cover-wrap img {
	transform: translateX(20%) rotate(2deg);
}

/* Винил-пластинка, выглядывающая из-за обложки */
.vinyl-behind {
	position: absolute;
	inset: 0;
	border-radius: 50%;
	margin: 8%;
	background:
		repeating-radial-gradient(
			circle,
			#1c1814 0 1px,
			#2a221b 1px 4px
		),
		#1c1814;
	display: grid;
	place-items: center;
	z-index: 1;
	transform: translateX(-30%);
	transition: transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}
.tile:hover .vinyl-behind {
	transform: translateX(15%) rotate(45deg);
}
.vinyl-label {
	width: 28%;
	height: 28%;
	border-radius: 50%;
	background:
		radial-gradient(circle, #fff 0 12%, transparent 13%),
		var(--accent);
	box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8);
}

.rating-badge {
	position: absolute;
	top: 0.55rem;
	right: 0.55rem;
	background: rgba(31, 26, 22, 0.85);
	color: #fff;
	border-radius: var(--radius-pill);
	padding: 0.2rem 0.55rem;
	font-size: 0.78rem;
	font-weight: 600;
	z-index: 3;
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	letter-spacing: 0.02em;
}

.meta {
	display: grid;
	gap: 0.15rem;
	padding: 0 0.15rem;
}
.artist {
	font-weight: 600;
	font-size: 0.95rem;
	line-height: 1.25;
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 1;
	-webkit-box-orient: vertical;
}
.title {
	color: var(--text-muted);
	font-size: 0.88rem;
	line-height: 1.3;
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}
.year {
	color: var(--text-subtle);
	font-size: 0.78rem;
	margin-top: 0.1rem;
}

@media (max-width: 640px) {
	.grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}
	.artist {
		font-size: 0.9rem;
	}
	.title {
		font-size: 0.83rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.cover-wrap img,
	.vinyl-behind {
		transition: none;
	}
	.tile:hover .cover-wrap img {
		transform: none;
	}
	.tile:hover .vinyl-behind {
		transform: translateX(-30%);
	}
}
</style>
