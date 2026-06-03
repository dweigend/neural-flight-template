<script lang="ts">
import { Select } from "bits-ui";
import {
	ChevronDown,
	Eye,
	Fish,
	Gamepad2,
	Glasses,
	Lightbulb,
	MapPin,
	Mountain,
	Network,
	Orbit,
	Palette,
	Plane,
	Play,
	RadioTower,
	Rocket,
	Smartphone,
	TreePine,
	Workflow,
	Wrench,
} from "lucide-svelte";
import type { ComponentType } from "svelte";
import { onDestroy } from "svelte";
import ArchitectureDiagram from "$lib/components/ArchitectureDiagram.svelte";
import DataTable from "$lib/components/DataTable.svelte";
import LinkCard from "$lib/components/LinkCard.svelte";
import NetworkPanel from "$lib/components/NetworkPanel.svelte";
import NodeEditorPreview from "$lib/components/NodeEditorPreview.svelte";
import PageHeader from "$lib/components/PageHeader.svelte";
import { listExperiences } from "$lib/experiences/catalog";
import { setActiveExperienceId } from "$lib/experiences/loader";
import { createWebSocketClient } from "$lib/ws/client.svelte";

let { data } = $props();

const ws = createWebSocketClient();

onDestroy(() => {
	ws.disconnect();
});

// ── Experience options for Select ──

interface ExperienceOption {
	id: string;
	name: string;
	description: string;
	author: string;
	version: string;
	paramCount: number;
	thumbnail?: string;
	icon: ComponentType;
	disabled: boolean;
}

const catalogExperiences = listExperiences();

const experienceOptions: ExperienceOption[] = [
	...catalogExperiences.map((exp) => ({
		id: exp.id,
		name: exp.name,
		description: exp.description,
		author: exp.author,
		version: exp.version,
		paramCount: exp.parameters.length,
		thumbnail: exp.thumbnail,
		icon: Mountain,
		disabled: false,
	})),
	{
		id: "placeholder-rocket",
		name: "Rocket Launch",
		description: "Coming soon",
		author: "TBD",
		version: "0.0.0",
		paramCount: 0,
		icon: Rocket,
		disabled: true,
	},
	{
		id: "placeholder-fish",
		name: "Deep Sea",
		description: "Coming soon",
		author: "TBD",
		version: "0.0.0",
		paramCount: 0,
		icon: Fish,
		disabled: true,
	},
	{
		id: "placeholder-orbit",
		name: "Orbit Station",
		description: "Coming soon",
		author: "TBD",
		version: "0.0.0",
		paramCount: 0,
		icon: Orbit,
		disabled: true,
	},
	{
		id: "placeholder-forest",
		name: "Forest Glide",
		description: "Coming soon",
		author: "TBD",
		version: "0.0.0",
		paramCount: 0,
		icon: TreePine,
		disabled: true,
	},
];

let selectedExperience = $state("");

function handleExperienceSelect(value: string | undefined): void {
	if (!value) return;
	selectedExperience = value;
	setActiveExperienceId(value);
}

const selectedOption = $derived(
	experienceOptions.find((o) => o.id === selectedExperience),
);

// ── Routes ──

const routes = [
	{
		path: "/vr",
		icon: Glasses,
		title: "VR Experience",
		description: "WebXR experience for Meta Quest",
		planned: false,
	},
	{
		path: "/gyro",
		icon: Smartphone,
		title: "Smartphone Gyro",
		description: "Device Orientation API input",
		planned: false,
	},
	{
		path: "/controller",
		icon: Gamepad2,
		title: "Desktop Controller",
		description: "Manual pitch/roll input",
		planned: false,
	},
	{
		path: "/m5-controller",
		icon: RadioTower,
		title: "M5 Controller",
		description: "Wireless M5Stick tuning",
		planned: false,
	},
	{
		path: "/node-editor",
		icon: Workflow,
		title: "Node Editor",
		description: "Visual programming for VR scene",
		planned: false,
	},
	{
		path: "/shader-playground",
		icon: Palette,
		title: "Shader Playground",
		description: "Modular shader rack with live preview",
		planned: false,
	},
	{
		path: "/spectator",
		icon: Eye,
		title: "Spectator Monitor",
		description: "External display for viewers",
		planned: true,
	},
	{
		path: "/dmx",
		icon: Lightbulb,
		title: "DMX Lighting",
		description: "Stage lighting integration",
		planned: true,
	},
];

// ── Tech Stack ──

const techStack = [
	{
		name: "SvelteKit",
		description: "Full-stack web framework",
		url: "https://svelte.dev",
	},
	{ name: "Bun", description: "JavaScript runtime", url: "https://bun.sh" },
	{
		name: "Three.js",
		description: "3D graphics library",
		url: "https://threejs.org",
	},
	{
		name: "WebXR",
		description: "VR/AR browser API",
		url: "https://immersiveweb.dev",
	},
	{
		name: "bits-ui",
		description: "Svelte UI components",
		url: "https://bits-ui.com",
	},
	{
		name: "ESP32",
		description: "Microcontroller",
		url: "https://espressif.com",
	},
	{
		name: "BNO055",
		description: "9-DOF IMU sensor",
		url: "https://www.adafruit.com/product/2472",
	},
];
</script>

<div class="landing-page">
	<PageHeader icon={Plane} label="ICAROS VR Platform" status={ws.status} />

	<main class="landing-main">
		<section class="intro">
			<p>
				VR teaching platform for Meta Quest, controlled by body movement on an ICAROS fitness device.
				Students build their own VR experiences — pitch and roll translate directly into controls via WebSocket.
			</p>
		</section>

		<section class="section">
			<h2 class="section-title"><Network size={14} /> Architecture</h2>
			<ArchitectureDiagram />
			<p class="architecture-motto">"The server sits in the center — like a spider in its web."</p>
		</section>

		<!-- ═══ Experience — 2-Column: Thumbnail | Select + Meta ═══ -->
		<section class="section">
			<h2 class="section-title"><MapPin size={14} /> Experience</h2>
			<p class="section-intro">
				Each experience is a modular VR world — built by students as a folder with scene,
				physics, and parameters. Pick one, then open a route.
			</p>
			<div class="experience-panel">
				<!-- Left: Thumbnail -->
				<div class="experience-thumbnail">
					{#if selectedOption?.thumbnail}
						<img src={selectedOption.thumbnail} alt={selectedOption.name} />
					{:else}
						<div class="experience-thumbnail-placeholder">
							{#if selectedOption}
								<selectedOption.icon size={48} />
							{:else}
								<Mountain size={48} />
							{/if}
						</div>
					{/if}
				</div>

				<!-- Right: Select + Description + Meta -->
				<div class="experience-info">
					<Select.Root type="single" value={selectedExperience} onValueChange={handleExperienceSelect}>
						<Select.Trigger class="experience-select-trigger">
							{#if selectedOption}
								<span class="experience-select-label">
									<selectedOption.icon size={16} />
									{selectedOption.name}
								</span>
							{:else}
								<span class="experience-select-placeholder">Choose Experience...</span>
							{/if}
							<ChevronDown size={16} />
						</Select.Trigger>

						<Select.Portal>
							<Select.Content class="experience-select-content" sideOffset={4} side="bottom">
								<Select.Viewport>
									{#each experienceOptions as option (option.id)}
										<Select.Item
											value={option.id}
											label={option.name}
											class="experience-select-item"
											disabled={option.disabled}
										>
											<span class="experience-select-item-inner">
												<option.icon size={14} />
												<span class="experience-select-item-text">
													<span class="experience-select-item-name">{option.name}</span>
													<span class="experience-select-item-desc">{option.description}</span>
												</span>
											</span>
											{#if option.disabled}
												<span class="badge">soon</span>
											{:else}
												<Play size={12} />
											{/if}
										</Select.Item>
									{/each}
								</Select.Viewport>
							</Select.Content>
						</Select.Portal>
					</Select.Root>

					{#if selectedOption}
						<p class="experience-description">{selectedOption.description}</p>
						<div class="experience-meta">
							<span>{selectedOption.author}</span>
							<span>v{selectedOption.version}</span>
							<span>{selectedOption.paramCount} params</span>
						</div>
					{:else}
						<p class="experience-description experience-description--empty">
							Select an experience to see details.
						</p>
					{/if}
				</div>
			</div>
		</section>

		<!-- ═══ Connect Devices ═══ -->
		<section class="section">
			<NetworkPanel network={data.network} qr={data.qr} />
		</section>

		<!-- ═══ Routes — Grid ═══ -->
		<section class="section">
			<h2 class="section-title"><Glasses size={14} /> Routes</h2>
			<div class="routes-grid">
				{#each routes as route}
					<LinkCard
						href={route.path}
						icon={route.icon}
						path={route.path}
						title={route.title}
						description={route.description}
						planned={route.planned}
					/>
				{/each}
			</div>
		</section>

		<!-- ═══ Node Editor ═══ -->
		<section class="section">
			<h2 class="section-title"><Workflow size={14} /> Node Editor</h2>
			<p class="section-intro">
				Visual programming for real-time VR scene control. Connect signal sources like LFOs and
				sliders through a mixer to dynamically control experience parameters.
			</p>
			<NodeEditorPreview />
		</section>

		<!-- ═══ Shader Playground ═══ -->
		<section class="section">
			<h2 class="section-title"><Palette size={14} /> Shader Playground</h2>
			<p class="section-intro">
				Modulares Shader-Rack mit Live 3D Preview. Vertex- und Fragment-Module per Drag & Drop
				stapeln, Parameter über Slider und LFO modulieren — wie ein Eurorack für Shader. 24 Module
				von Sine Displace bis Cosine Palette.
			</p>
			<div class="feature-list">
				<span class="feature-item">24 Rack Modules</span>
				<span class="feature-item">5 Geometry Targets</span>
				<span class="feature-item">Drag & Drop</span>
				<span class="feature-item">LFO + Noise Modulation</span>
				<span class="feature-item">Signal Routing</span>
				<span class="feature-item">Live TSL Preview</span>
			</div>
		</section>

		<!-- ═══ Tech Stack ═══ -->
		<section class="section">
			<h2 class="section-title"><Wrench size={14} /> Tech Stack</h2>
			<DataTable items={techStack} />
		</section>
	</main>
</div>
