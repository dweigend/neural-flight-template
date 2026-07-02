<script module lang="ts">
	import type { VisioTileChunkManifestEntry } from "$lib/experiences/visio-technologica/chunking";

	export type VisioTileChunkManifestStatus = Readonly<{
		observerChunkKey: string;
		pointerLockLabel: string;
		positionLabel: string;
		selectedChunkKeys: readonly string[];
		visibleChunkCount: number;
		visibleTileIds: readonly string[];
	}>;

	export type VisioTileChunkManifestEntryView = Readonly<{
		chunkKey: VisioTileChunkManifestEntry["chunkKey"];
		fileName: VisioTileChunkManifestEntry["fileName"];
		id: VisioTileChunkManifestEntry["id"];
		isVisible: boolean;
	}>;
</script>

<script lang="ts">
	let {
		entries,
		status,
	}: {
		entries: readonly VisioTileChunkManifestEntryView[];
		status: VisioTileChunkManifestStatus;
	} = $props();
</script>

<section class="debug-panel" aria-label="Visio tile chunk manifest debug panel">
	<header class="debug-panel__header">
		<h1>Visio Tile Chunk Manifest</h1>
		<p>
			Metadata-first tile-to-chunk adapter preview. Proxies are driven only by
			logical metadata and current horizon selection.
		</p>
	</header>

	<div class="debug-panel__meta">
		<p><strong>Observer chunk:</strong> {status.observerChunkKey}</p>
		<p><strong>Position:</strong> {status.positionLabel}</p>
		<p><strong>Mouse:</strong> {status.pointerLockLabel}</p>
		<p><strong>Visible chunks:</strong> {status.visibleChunkCount}</p>
		<p><strong>Visible tiles:</strong> {status.visibleTileIds.length}</p>
		<p class="debug-panel__hint">
			Click the viewport to capture the mouse. Use <code>WASD</code> / arrow keys to move,
			<code>Space</code> to rise, and <code>Shift</code> to descend.
		</p>
	</div>

	<div>
		<h2>Current horizon chunk keys</h2>
		<ul class="key-list">
			{#each status.selectedChunkKeys as chunkKey}
				<li>{chunkKey}</li>
			{/each}
		</ul>
	</div>

	<div>
		<h2>Tile → chunk mapping</h2>
		<ul class="manifest-list">
			{#each entries as entry}
				<li class:manifest-list__item--visible={entry.isVisible} class="manifest-list__item">
					<div><strong>{entry.id}</strong></div>
					<div>{entry.fileName}</div>
					<div><code>{entry.chunkKey}</code></div>
				</li>
			{/each}
		</ul>
	</div>
</section>

<style>
	.debug-panel {
		padding: 1.25rem;
		background: rgba(15, 23, 42, 0.94);
		border-left: 1px solid rgba(148, 163, 184, 0.2);
		overflow: auto;
		color: #e2e8f0;
	}

	.debug-panel__header h1 {
		font-size: 1.2rem;
		margin: 0 0 0.65rem;
	}

	.debug-panel__header p,
		.debug-panel__meta p {
		margin: 0 0 0.7rem;
		line-height: 1.45;
		color: #cbd5e1;
	}

	.debug-panel__hint {
		font-size: 0.9rem;
		color: #94a3b8;
	}

	h2 {
		font-size: 0.95rem;
		margin: 1.25rem 0 0.5rem;
	}

	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	.key-list,
	.manifest-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.key-list {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.82rem;
	}

	.key-list li,
	.manifest-list__item {
		padding: 0.5rem 0.6rem;
		border-radius: 0.55rem;
		background: rgba(30, 41, 59, 0.9);
		border: 1px solid rgba(148, 163, 184, 0.12);
	}

	.manifest-list__item {
		display: grid;
		gap: 0.22rem;
		font-size: 0.82rem;
	}

	.manifest-list__item--visible {
		border-color: rgba(103, 232, 249, 0.7);
		background: rgba(8, 47, 73, 0.92);
	}

	@media (max-width: 960px) {
		.debug-panel {
			border-left: none;
			border-top: 1px solid rgba(148, 163, 184, 0.2);
		}
	}
</style>
