<script lang="ts">
    import {
        PUBLIC_ICAROS_EXPERIENCE_ID,
        PUBLIC_ICAROS_EXPERIENCE_TITLE,
        PUBLIC_ICAROS_HOST_ORIGIN,
    } from "$env/static/public";
    import { Trophy } from "lucide-svelte";
    import { onDestroy, onMount } from "svelte";
    import * as THREE from "three";
    import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
    import type { ActiveExperience } from "$lib/experiences/loader";
    import {
        getActiveExperienceId,
        loadExperience,
        unloadExperience,
    } from "$lib/experiences/loader";
    import type { PlayerOrientationInput } from "$lib/experiences/types";
    import { EXTERNAL_INPUT_GRACE_MS } from "$lib/experiences/visio-technologica/keyboard-camera-controls";
    import { createWebSocketClient } from "$lib/ws/client.svelte";
    import { createIcarosHostControlClient } from "$lib/ws/icaros-host-control-client";
    import { createIcarosHostRuntimeClient } from "$lib/ws/icaros-host-runtime-client";
    import {
        isOrientationData,
        isSettingsUpdate,
        isSpeedCommand,
    } from "$lib/ws/protocol";

    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let vrButton: HTMLElement;
    let score = $state(0);
    let experienceName = $state("ICAROS VR");
    let hasOutputs = $state(false);
    let lastProcessedTimestamp = 0;
    const hostOrigin = PUBLIC_ICAROS_HOST_ORIGIN.trim();
    const useIcarosHost = hostOrigin !== "";
    const ws = useIcarosHost ? null : createWebSocketClient();
    const hostControl = useIcarosHost
        ? createIcarosHostControlClient({ hostOrigin })
        : null;
    const hostRuntime = useIcarosHost
        ? createIcarosHostRuntimeClient({
              hostOrigin,
              experienceId: PUBLIC_ICAROS_EXPERIENCE_ID.trim() || "neural-flight-vr",
              title: PUBLIC_ICAROS_EXPERIENCE_TITLE.trim() || "Neural Flight VR",
          })
        : null;
    const clock = new THREE.Clock();

    let lastOrientation: PlayerOrientationInput = { pitch: 0, roll: 0 };
    let lastSpeed = { accelerate: false, brake: false };
    let lastOrientationReceivedAt = 0;
    let removeResizeListener: (() => void) | null = null;
    let unsubscribeHostOrientation: (() => void) | null = null;

    onMount(() => {
        if (hostControl !== null) {
            unsubscribeHostOrientation = hostControl.onOrientation(
                (orientation) => {
                    lastOrientation =
                        orientation.quality > 0
                            ? { pitch: orientation.pitch, roll: orientation.roll }
                            : { pitch: 0, roll: 0 };
                    lastOrientationReceivedAt = performance.now();
                },
            );
            hostControl.start();
            hostRuntime?.start();
        }

        scene = new THREE.Scene();
        const dummyCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        vrButton = VRButton.createButton(renderer);
        document.body.appendChild(vrButton);

        // Load whichever experience is selected (persisted in localStorage)
        const experienceId = getActiveExperienceId();

        loadExperience(experienceId, {
            scene,
            camera: dummyCamera,
            renderer,
        }).then((exp: ActiveExperience) => {
            renderer.shadowMap.enabled = exp.manifest.id !== "berlin-flight";
            experienceName = exp.manifest.name;
            hasOutputs = (exp.manifest.outputs?.length ?? 0) > 0;
            const renderCamera = exp.state.camera as THREE.PerspectiveCamera;

            function onResize(): void {
                renderCamera.aspect = window.innerWidth / window.innerHeight;
                renderCamera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
            window.addEventListener("resize", onResize);
            removeResizeListener = () =>
                window.removeEventListener("resize", onResize);

            renderer.setAnimationLoop(() => {
                const delta = clock.getDelta();

                const msg = ws?.lastMessage;
                if (!useIcarosHost && msg && msg.timestamp > lastProcessedTimestamp) {
                    lastProcessedTimestamp = msg.timestamp;

                    if (isOrientationData(msg)) {
                        lastOrientation = {
                            pitch: msg.pitch,
                            roll: msg.roll,
                            ...(msg.yaw !== undefined ? { yaw: msg.yaw } : {}),
                            ...(msg.rawPitch !== undefined
                                ? { rawPitch: msg.rawPitch }
                                : {}),
                            ...(msg.rawRoll !== undefined
                                ? { rawRoll: msg.rawRoll }
                                : {}),
                        };
                        lastOrientationReceivedAt = performance.now();
                    }
                    if (isSpeedCommand(msg)) {
                        lastSpeed = {
                            accelerate:
                                msg.action === "accelerate" && msg.active,
                            brake: msg.action === "brake" && msg.active,
                        };
                    }
                    if (isSettingsUpdate(msg)) {
                        for (const key of Object.keys(msg.settings)) {
                            exp.manifest.applySettings(
                                key,
                                msg.settings[key] as number | boolean | string,
                                exp.state,
                                scene,
                            );
                        }
                    }
                }

                const isVisioTechnologica =
                    exp.manifest.id === "visio-technologica";
                const orientationIsFresh =
                    performance.now() - lastOrientationReceivedAt <=
                    EXTERNAL_INPUT_GRACE_MS;
                const effectiveOrientation =
                    isVisioTechnologica && !orientationIsFresh
                        ? { pitch: Number.NaN, roll: Number.NaN }
                        : lastOrientation;

                exp.manifest.updatePlayer(
                    effectiveOrientation,
                    lastSpeed,
                    exp.state,
                    delta,
                );
                const result = exp.manifest.tick(exp.state, {
                    delta,
                    elapsed: clock.elapsedTime,
                    camera: renderCamera,
                    playerPosition:
                        renderCamera.parent?.position ?? new THREE.Vector3(),
                    playerRotation:
                        renderCamera.parent?.rotation ?? new THREE.Euler(),
                });
                exp.state = result.state;
                if (result.outputs?.score !== undefined) {
                    score = result.outputs.score as number;
                }

                renderer.render(scene, renderCamera);
            });
        });

        return () => {
            removeResizeListener?.();
        };
    });

    onDestroy(() => {
        renderer?.setAnimationLoop(null);
        if (scene) unloadExperience(scene);
        renderer?.dispose();
        vrButton?.remove();
        unsubscribeHostOrientation?.();
        hostControl?.disconnect();
        hostRuntime?.disconnect();
        ws?.disconnect();
    });
</script>

<svelte:head>
    <title>{experienceName} | ICAROS VR</title>
</svelte:head>

<canvas bind:this={canvas} class="vr-canvas"></canvas>

{#if hasOutputs}
    <div class="score-overlay">
        <Trophy size={20} />
        {score}
    </div>
{/if}
