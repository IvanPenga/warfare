import type { GameEvent } from '../game/game-state';
import type { Camera } from './level-renderer';

// Visual effects only: they use Math.random and never feed back into the game state.

type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    age: number;
    size: number;
    color: string;
};
type Flash = { x: number; y: number; radius: number; age: number };
type Beam = { x: number; y: number; endX: number; endY: number; color: string; age: number };

const flashDuration = 0.35;
const particleGravity = 400;
const debrisColors = ['#8a5a3b', '#6a4029', '#a8744e', '#7d8089'];
const fireColors = ['#ffd54a', '#ff9a3c', '#ff5a2a'];

function pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

export type Effects = {
    add: (event: GameEvent) => void;
    update: (seconds: number) => void;
    draw: (context: CanvasRenderingContext2D, camera: Camera) => void;
    /** Screen shake in world pixels, fading after each explosion. */
    getShake: () => { x: number; y: number };
};

/** Explosion flashes, flying dirt and sparks, and screen shake. */
export function createEffects(): Effects {
    const particles: Particle[] = [];
    const flashes: Flash[] = [];
    const beams: Beam[] = [];
    let shake = 0;

    function burst(x: number, y: number, count: number, speed: number, colors: string[], life: number) {
        for (let index = 0; index < count; index++) {
            const direction = Math.random() * Math.PI * 2;
            const velocity = speed * (0.3 + Math.random() * 0.7);

            particles.push({
                x,
                y,
                vx: Math.cos(direction) * velocity,
                vy: Math.sin(direction) * velocity - speed * 0.4,
                life: life * (0.5 + Math.random() * 0.5),
                age: 0,
                size: 1 + Math.floor(Math.random() * 3),
                color: pick(colors)
            });
        }
    }

    return {
        add(event) {
            if (event.type === 'explosion') {
                flashes.push({ x: event.x, y: event.y, radius: event.radius, age: 0 });
                const sparkColors =
                    event.weaponId === 'railBolt'
                        ? ['#69e8ff', '#ffffff', '#2aa6ff']
                        : event.weaponId === 'fireworkSpark'
                          ? ['#ff5ad8', '#ffe07a', '#69e8ff']
                          : event.weaponId === 'mortarShard'
                            ? ['#ffd54a', '#ffffff', '#ff9a3c']
                            : fireColors;

                burst(event.x, event.y, 40, event.radius * 7, debrisColors, 1.2);
                burst(event.x, event.y, 20, event.radius * 5, sparkColors, 0.5);
                shake = Math.max(shake, event.radius / 4);
            } else if (event.type === 'beam') {
                beams.push({ ...event, age: 0 });
                burst(event.endX, event.endY, 14, 160, ['#69e8ff', '#ffffff'], 0.35);
            } else if (event.type === 'fired') {
                burst(event.x, event.y, 6, 60, ['#e6e6ec', '#b3b8c2'], 0.4);
            } else if (event.type === 'dig') {
                if (Math.random() < 0.3) {
                    burst(event.x, event.y, 2, 40, debrisColors, 0.4);
                }
            } else if (event.type === 'bounce') {
                burst(event.x, event.y, 4, 60, debrisColors, 0.4);
            } else if (event.type === 'split') {
                burst(event.x, event.y, 12, 90, fireColors, 0.4);
            } else if (event.type === 'tankDestroyed') {
                burst(event.x, event.y - 6, 50, 220, [...fireColors, '#3a3a44'], 1.5);
                shake = Math.max(shake, 8);
            }
        },

        update(seconds) {
            for (const particle of particles) {
                particle.age += seconds;
                particle.vy += particleGravity * seconds;
                particle.x += particle.vx * seconds;
                particle.y += particle.vy * seconds;
            }
            for (const flash of flashes) {
                flash.age += seconds;
            }
            for (const beam of beams) {
                beam.age += seconds;
            }
            for (let index = particles.length - 1; index >= 0; index--) {
                if (particles[index].age >= particles[index].life) {
                    particles.splice(index, 1);
                }
            }
            for (let index = flashes.length - 1; index >= 0; index--) {
                if (flashes[index].age >= flashDuration) {
                    flashes.splice(index, 1);
                }
            }
            for (let index = beams.length - 1; index >= 0; index--) {
                if (beams[index].age >= 0.18) {
                    beams.splice(index, 1);
                }
            }
            shake = Math.max(0, shake - seconds * 20);
        },

        draw(context, camera) {
            for (const beam of beams) {
                context.globalAlpha = 1 - beam.age / 0.18;
                context.strokeStyle = beam.color;
                context.lineWidth = 4 * camera.zoom;
                context.beginPath();
                context.moveTo((beam.x - camera.x) * camera.zoom, (beam.y - camera.y) * camera.zoom);
                context.lineTo((beam.endX - camera.x) * camera.zoom, (beam.endY - camera.y) * camera.zoom);
                context.stroke();
                context.strokeStyle = '#ffffff';
                context.lineWidth = 1 * camera.zoom;
                context.stroke();
            }
            for (const flash of flashes) {
                const progress = flash.age / flashDuration;

                context.globalAlpha = 1 - progress;
                context.fillStyle = progress < 0.3 ? '#fff6c8' : '#ffb347';
                context.beginPath();
                context.arc(
                    (flash.x - camera.x) * camera.zoom,
                    (flash.y - camera.y) * camera.zoom,
                    flash.radius * (0.6 + progress * 0.6) * camera.zoom,
                    0,
                    Math.PI * 2
                );
                context.fill();
            }
            for (const particle of particles) {
                context.globalAlpha = 1 - particle.age / particle.life;
                context.fillStyle = particle.color;
                context.fillRect(
                    Math.round((particle.x - camera.x) * camera.zoom),
                    Math.round((particle.y - camera.y) * camera.zoom),
                    Math.ceil(particle.size * camera.zoom),
                    Math.ceil(particle.size * camera.zoom)
                );
            }
            context.globalAlpha = 1;
        },

        getShake() {
            return { x: (Math.random() - 0.5) * shake, y: (Math.random() - 0.5) * shake };
        }
    };
}
