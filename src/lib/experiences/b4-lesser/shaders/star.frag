varying vec3 vC;
varying float vTw;

void main() {
    vec2 pt = gl_PointCoord - 0.5;
    float r = length(pt);

    // 1. Intense White-Hot Core
    float core = exp(-r * 45.0);

    // 2. Cinematic Anamorphic Flare (Horizontal Streak)
    float streak = exp(-abs(pt.y) * 120.0 - abs(pt.x) * 6.0) * 1.5;

    // 3. Soft Volumetric Halo
    float halo = exp(-r * 12.0) * 0.4;

    // Combine
    float alpha = (core + streak + halo) * vTw;

    if (alpha < 0.01) discard;

    // Push the center of the flare to pure white to simulate overexposure
    vec3 finalColor = mix(vC, vec3(1.0), core * 0.9);

    gl_FragColor = vec4(finalColor * alpha, alpha);
}