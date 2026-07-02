<script lang="ts">
    const experiments: { name: string; href: string; description: string }[] = [
        {
            name: "Gradient Prism",
            href: "/lab/gradient-prism",
            description:
                "Monolith field with gradient shaders, bloom, starfield, and film grain",
        },
		{
		name: "Sonar Overlay",
		path: "sonar",
		description:
			"Opening sequence sonar sweep overlay with rotating scan line, pinging dots, and trailing glow",
		},
        {
            name: "Neon Metaball",
            href: "/lab/neon-metaball",
            description:
                "Organic neon blobs over dark reflective water with bloom glow",
        },
        {
            name: "Visio Chunk Grid",
            href: "/visio-technologica/lab/chunk-grid",
            description:
                "Static Three.js chunk-grid debug page for validating Visio chunk coordinates",
        },
        {
            name: "Visio Chunk Horizon",
            href: "/visio-technologica/lab/visio-chunk-horizon",
            description:
                "Flying placeholder horizon demo for validating observer-based chunk selection",
        },
        {
            name: "Visio Tile Chunk Manifest",
            href: "/lab/visio-tile-chunk-manifest",
            description:
                "Metadata-first Visio proxy grid with horizon-highlighted chunk membership",
        },
    ];
</script>

<main>
    <h1>Lab — Visual Experiments</h1>
    <p>
        Temporary sandbox for Three.js shader tests. Not part of the production
        system.
    </p>

    {#if experiments.length === 0}
        <p class="empty">
            No experiments yet. Create a subfolder with a +page.svelte to start.
        </p>
    {:else}
        <ul>
            {#each experiments as exp}
                <li>
                    <a href={exp.href}>{exp.name}</a>
                    <span>{exp.description}</span>
                </li>
            {/each}
        </ul>
    {/if}
</main>

<style>
    main {
        max-width: 600px;
        margin: 4rem auto;
        font-family: system-ui, sans-serif;
        padding: 0 1rem;
    }

    h1 {
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
    }

    p {
        color: #888;
        margin-bottom: 2rem;
    }

    .empty {
        font-style: italic;
    }

    ul {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    li {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    a {
        color: #7c6ef0;
        font-weight: 600;
        text-decoration: none;
    }

    a:hover {
        text-decoration: underline;
    }

    span {
        color: #666;
        font-size: 0.875rem;
    }
</style>
