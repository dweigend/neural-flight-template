<script module lang="ts">
	export type VisioChunkHorizonStatus = Readonly<{
		activeChunkCount: number
		chunkKeys: readonly string[]
		observerChunkKey: string
		pointerLockLabel: string
		positionLabel: string
		directionLabel: string
	}>
</script>

<script lang="ts">
	let { status }: { status: VisioChunkHorizonStatus } = $props()
</script>

<section class="debug-panel" aria-label="Visio chunk horizon debug panel">
	<header class="debug-panel__header">
		<h1>Visio Chunk Horizon</h1>
		<p>
			Placeholder-only horizon lab for validating chunk selection as a streaming basis.
		</p>
	</header>

	<div class="debug-panel__meta">
		<p><strong>Observer chunk:</strong> {status.observerChunkKey}</p>
		<p><strong>Heading:</strong> {status.directionLabel}</p>
		<p><strong>Position:</strong> {status.positionLabel}</p>
		<p><strong>Mouse:</strong> {status.pointerLockLabel}</p>
		<p><strong>Horizon chunks:</strong> {status.activeChunkCount}</p>
		<p class="debug-panel__hint">
			Click the viewport to capture the mouse. Use <code>WASD</code> / arrow keys to move,
			 <code>Space</code> to rise, and <code>Shift</code> to descend.
		</p>
	</div>

	<div>
		<h2>Selected chunk keys</h2>
		<ul class="key-list">
			{#each status.chunkKeys as chunkKey}
				<li>{chunkKey}</li>
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

	.key-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.82rem;
	}

	.key-list li {
		padding: 0.45rem 0.55rem;
		border-radius: 0.5rem;
		background: rgba(30, 41, 59, 0.9);
		border: 1px solid rgba(148, 163, 184, 0.12);
	}

	@media (max-width: 960px) {
		.debug-panel {
			border-left: none;
			border-top: 1px solid rgba(148, 163, 184, 0.2);
		}
	}
</style>
