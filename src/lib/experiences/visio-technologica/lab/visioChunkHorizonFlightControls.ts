export type VisioChunkFlightInput = Readonly<{
	forward: number
	strafe: number
	vertical: number
}>

const FORWARD_KEYS = ['KeyW', 'ArrowUp'] as const
const BACKWARD_KEYS = ['KeyS', 'ArrowDown'] as const
const STRAFE_LEFT_KEYS = ['KeyA', 'ArrowLeft'] as const
const STRAFE_RIGHT_KEYS = ['KeyD', 'ArrowRight'] as const
const ASCEND_KEYS = ['Space'] as const
const DESCEND_KEYS = ['ShiftLeft', 'ShiftRight'] as const

const HANDLED_KEYS = new Set<string>([
	...FORWARD_KEYS,
	...BACKWARD_KEYS,
	...STRAFE_LEFT_KEYS,
	...STRAFE_RIGHT_KEYS,
	...ASCEND_KEYS,
	...DESCEND_KEYS
])

export function isVisioChunkFlightCode(code: string): boolean {
	return HANDLED_KEYS.has(code)
}

export function createVisioChunkFlightInput(
	pressedKeys: ReadonlySet<string>
): VisioChunkFlightInput {
	return {
		forward: getPressedValue(pressedKeys, FORWARD_KEYS) - getPressedValue(pressedKeys, BACKWARD_KEYS),
		strafe: getPressedValue(pressedKeys, STRAFE_RIGHT_KEYS) - getPressedValue(pressedKeys, STRAFE_LEFT_KEYS),
		vertical: getPressedValue(pressedKeys, ASCEND_KEYS) - getPressedValue(pressedKeys, DESCEND_KEYS)
	}
}

function getPressedValue(
	pressedKeys: ReadonlySet<string>,
	codes: readonly string[]
): number {
	for (const code of codes) {
		if (pressedKeys.has(code)) {
			return 1
		}
	}

	return 0
}
