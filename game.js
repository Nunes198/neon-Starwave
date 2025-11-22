// Neon Starwave - Código principal
// Todo o JavaScript do jogo foi movido para este arquivo

// --- Configuração Básica ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let width, height;
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

// --- Desktop Shoot Button ---
const desktopShootBtn = document.getElementById('desktop-shoot');
if (desktopShootBtn) {
    desktopShootBtn.addEventListener('mousedown', () => { keys.Space = true; });
    desktopShootBtn.addEventListener('mouseup', () => { keys.Space = false; });
    desktopShootBtn.addEventListener('mouseleave', () => { keys.Space = false; });
}

// --- Desktop Cursor ---
const desktopCursor = document.getElementById('desktop-cursor');
if (desktopCursor) {
    document.addEventListener('mousemove', e => {
        desktopCursor.style.left = e.clientX + 'px';
        desktopCursor.style.top = e.clientY + 'px';
    });
}
// --- Música de Introdução ---
let introAudioCtx, introGain, introOsc;
function playIntroMusic() {
    if (!introAudioCtx) introAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    introGain = introAudioCtx.createGain();
    introOsc = introAudioCtx.createOscillator();
    introOsc.type = 'sine';
    introOsc.frequency.setValueAtTime(220, introAudioCtx.currentTime);
    introOsc.frequency.linearRampToValueAtTime(440, introAudioCtx.currentTime + 2);
    introGain.gain.setValueAtTime(0.15, introAudioCtx.currentTime);
    introOsc.connect(introGain);
    introGain.connect(introAudioCtx.destination);
    introOsc.start();
}

function stopIntroMusic() {
    if (introOsc) {
        introOsc.stop();
        introOsc.disconnect();
        introOsc = null;
    }
    if (introGain) {
        introGain.disconnect();
        introGain = null;
    }
    if (introAudioCtx) {
        introAudioCtx.close();
        introAudioCtx = null;
    }
}
window.addEventListener('DOMContentLoaded', playIntroMusic);

// --- Estado do Jogo ---
let gameRunning = false;
let score = 0;
let animationId;
let lastTime = 0;

// Inputs
const keys = {
    ArrowUp: false, w: false,
    ArrowLeft: false, a: false,
    ArrowRight: false, d: false,
    ArrowDown: false, s: false,
    Space: false, " ": false
};

// --- Audio System (Sintetizador Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'shoot') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'explosion') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'thrust') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(50, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }
}

// --- Classes do Jogo ---
// --- Classe Container (Power-up) ---
class Container {
    constructor() {
        this.radius = 18;
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.color = '#0ff';
        this.pulse = 0;
    }
    update() {
        this.pulse += 0.1;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(this.pulse);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${(this.pulse*60)%360}, 80%, 55%)`;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.restore();
    }
}

// --- Classe Ship ---
class Ship {
    constructor() {
        this.x = width / 2;
        this.y = height / 2;
        this.vx = 0;
        this.vy = 0;
        this.radius = 15;
        this.angle = -Math.PI / 2;
        this.thrust = 0.3;
        this.friction = 0.95;
        this.isThrusting = false;
        this.shootCooldown = 0;
        this.invulnerable = 120;
        this.visible = true;
    }
    update() {
        if (!this.visible) return;
        let inputX = 0;
        let inputY = 0;
        if (keys.ArrowUp || keys.w || activeTouch.up) inputY -= 1;
        if (keys.ArrowDown || keys.s || activeTouch.down) inputY += 1;
        if (keys.ArrowLeft || keys.a || activeTouch.left) inputX -= 1;
        if (keys.ArrowRight || keys.d || activeTouch.right) inputX += 1;
        this.isThrusting = (inputX !== 0 || inputY !== 0);
        if (this.isThrusting) {
            const length = Math.sqrt(inputX**2 + inputY**2);
            inputX /= length;
            inputY /= length;
            this.vx += inputX * this.thrust;
            this.vy += inputY * this.thrust;
            const targetAngle = Math.atan2(inputY, inputX);
            let diff = targetAngle - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.angle += diff * 0.15;
            if (Math.random() > 0.5) {
                particles.push(new Particle(
                    this.x - Math.cos(this.angle) * this.radius,
                    this.y - Math.sin(this.angle) * this.radius,
                    -this.vx * 0.5 + (Math.random() - 0.5), 
                    -this.vy * 0.5 + (Math.random() - 0.5),
                    '#0ff'
                ));
            }
            if (frameCount % 5 === 0) playSound('thrust');
        }
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.friction;
        this.vy *= this.friction;
        if (this.x < -this.radius) this.x = width + this.radius;
        if (this.x > width + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = height + this.radius;
        if (this.y > height + this.radius) this.y = -this.radius;
        if (this.shootCooldown > 0) this.shootCooldown--;
        if ((keys.Space || keys[" "] || activeTouch.shoot) && this.shootCooldown <= 0) {
            bullets.push(new Bullet(
                this.x + Math.cos(this.angle) * this.radius,
                this.y + Math.sin(this.angle) * this.radius,
                this.angle
            ));
            this.shootCooldown = 15;
            playSound('shoot');
        }
        if (this.invulnerable > 0) this.invulnerable--;
    }
    draw() {
        if (!this.visible) return;
        if (this.invulnerable > 0 && Math.floor(Date.now() / 100) % 2 === 0) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(-this.radius * 0.7, -this.radius * 0.6);
        ctx.lineTo(-this.radius * 0.5, 0);
        ctx.lineTo(-this.radius * 0.7, this.radius * 0.6);
        ctx.closePath();
        ctx.fillStyle = '#021e2f';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#0ff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0ff';
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -this.radius * 0.2, this.radius * 0.35, this.radius * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0ff';
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.moveTo(-this.radius * 0.5, -this.radius * 0.5);
        ctx.lineTo(-this.radius * 1.1, -this.radius * 0.9);
        ctx.lineTo(-this.radius * 0.5, 0);
        ctx.lineTo(-this.radius * 1.1, this.radius * 0.9);
        ctx.lineTo(-this.radius * 0.5, this.radius * 0.5);
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-this.radius * 0.7, -this.radius * 0.4, 3, 0, Math.PI * 2);
        ctx.arc(-this.radius * 0.7, this.radius * 0.4, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0ff';
        ctx.fill();
        if (this.isThrusting) {
            ctx.save();
            ctx.rotate(Math.PI);
            ctx.beginPath();
            ctx.moveTo(this.radius * 0.5, 0);
            ctx.lineTo(this.radius * 0.5 + 10 + Math.random() * 10, -5);
            ctx.lineTo(this.radius * 0.5 + 10 + Math.random() * 10, 5);
            ctx.closePath();
            ctx.fillStyle = '#f0f';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f0f';
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.restore();
        }
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.speed = 7 + bulletPower * 2;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.life = 60;
        this.size = 2 + bulletPower;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
    }
    draw() {
        let color = '#fff';
        if (bulletPower >= 2) color = '#0ff';
        if (bulletPower >= 4) color = '#a0f';
        if (bulletPower >= 6) color = '#ffd700';
        if (bulletPower >= 3) {
            ctx.save();
            ctx.globalAlpha = 0.3 + bulletPower * 0.07;
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.ellipse(this.x - this.vx * 2, this.y - this.vy * 2, this.size * 0.7, this.size * 0.3, Math.atan2(this.vy, this.vx), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowBlur = 10 + bulletPower * 4;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size + bulletPower * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Asteroid {
    constructor(x, y, r) {
        this.x = x || Math.random() * width;
        this.y = y || Math.random() * height;
        if (!x && !y) {
            while (dist(this.x, this.y, ship.x, ship.y) < 150) {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
            }
        }
        this.radius = r || Math.random() * 30 + 20;
        const speed = (50 / this.radius) * 1.5;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.vertices = [];
        const numVerts = Math.floor(Math.random() * 5) + 7;
        for (let i = 0; i < numVerts; i++) {
            const a = (i / numVerts) * Math.PI * 2;
            const dist = this.radius * (0.8 + Math.random() * 0.4);
            this.vertices.push({
                x: Math.cos(a) * dist,
                y: Math.sin(a) * dist
            });
        }
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < -this.radius) this.x = width + this.radius;
        if (this.x > width + this.radius) this.x = -this.radius;
        if (this.y < -this.radius) this.y = height + this.radius;
        if (this.y > height + this.radius) this.y = -this.radius;
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f0f';
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (let i = 1; i < this.vertices.length; i++) {
            ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, vx, vy, color) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = 30 + Math.random() * 10;
        this.color = color;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life--;
    }
    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life / 40;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- Variáveis Globais e Helpers ---
let containers = [];
let spreadLevel = 0;
let containerSpawnTimer = 0;
let ship;
let bullets = [];
let asteroids = [];
let particles = [];
let level = 1;
let frameCount = 0;
let bulletPower = 1;

function dist(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function spawnAsteroids() {
    asteroids = [];
    const count = 4 + level;
    for (let i = 0; i < count; i++) {
        asteroids.push(new Asteroid());
    }
}

function createExplosion(x, y, count, color) {
    playSound('explosion');
    for(let i=0; i<count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3;
        particles.push(new Particle(
            x, y, 
            Math.cos(angle) * speed, 
            Math.sin(angle) * speed,
            color
        ));
    }
}

// --- Game Loop ---
function loop() {
    if (!gameRunning) return;
    ctx.fillStyle = 'rgba(5, 5, 5, 0.4)';
    ctx.fillRect(0, 0, width, height);
    frameCount++;
    ship.update();
    ship.draw();
    for (let i = containers.length - 1; i >= 0; i--) {
        containers[i].update();
        containers[i].draw();
        if (ship.visible && dist(ship.x, ship.y, containers[i].x, containers[i].y) < ship.radius + containers[i].radius) {
            spreadLevel = Math.min(spreadLevel + 1, 5);
            bulletPower = Math.min(bulletPower + 1, 6);
            containers.splice(i, 1);
            createExplosion(ship.x, ship.y, 15, '#0ff');
        }
    }
    if (gameRunning) {
        containerSpawnTimer++;
        if (containerSpawnTimer >= 60 * 5 && containers.length < 1) {
            containers.push(new Container());
            containerSpawnTimer = 0;
        }
    }
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update();
        bullets[i].draw();
        if (bullets[i].life <= 0) {
            bullets.splice(i, 1);
        }
    }
    if (asteroids.length === 0) {
        level++;
        spawnAsteroids();
    }
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const ast = asteroids[i];
        ast.update();
        ast.draw();
        if (ship.visible && ship.invulnerable <= 0 && dist(ship.x, ship.y, ast.x, ast.y) < ship.radius + ast.radius) {
            createExplosion(ship.x, ship.y, 50, '#0ff');
            ship.visible = false;
            gameOver();
            return;
        }
        for (let j = bullets.length - 1; j >= 0; j--) {
            const b = bullets[j];
            if (dist(b.x, b.y, ast.x, ast.y) < ast.radius) {
                createExplosion(ast.x, ast.y, 20, '#f0f');
                if (ast.radius > 15) {
                    asteroids.push(new Asteroid(ast.x, ast.y, ast.radius / 2));
                    asteroids.push(new Asteroid(ast.x, ast.y, ast.radius / 2));
                }
                score += Math.floor(100 / ast.radius * 10);
                document.getElementById('score').innerText = score;
                asteroids.splice(i, 1);
                bullets.splice(j, 1);
                break;
            }
        }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    animationId = requestAnimationFrame(loop);
}

// --- Controle de Jogo ---
function startGame() {
    stopIntroMusic();
    initAudio();
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    resetGameVars();
    gameRunning = true;
    loop();
}

function resetGame() {
    document.getElementById('game-over-screen').classList.add('hidden');
    resetGameVars();
    gameRunning = true;
    loop();
}

function resetGameVars() {
    score = 0;
    level = 1;
    document.getElementById('score').innerText = '0';
    ship = new Ship();
    bullets = [];
    particles = [];
    containers = [];
    spreadLevel = 0;
    bulletPower = 1;
    containerSpawnTimer = 0;
    spawnAsteroids();
}

function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    setTimeout(() => {
        document.getElementById('final-score').innerText = score;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }, 1000);
}

// --- Event Listeners ---
window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);
const activeTouch = { left: false, right: false, up: false, down: false, shoot: false };
const setupTouch = (id, key) => {
    const el = document.getElementById(id);
    const handleStart = (e) => { e.preventDefault(); activeTouch[key] = true; el.classList.add('active'); };
    const handleEnd = (e) => { e.preventDefault(); activeTouch[key] = false; el.classList.remove('active'); };
    el.addEventListener('touchstart', handleStart, {passive: false});
    el.addEventListener('touchend', handleEnd, {passive: false});
    el.addEventListener('mousedown', handleStart);
    el.addEventListener('mouseup', handleEnd);
    el.addEventListener('mouseleave', handleEnd);
};
setupTouch('btn-left', 'left');
setupTouch('btn-right', 'right');
setupTouch('btn-up', 'up');
setupTouch('btn-down', 'down');
setupTouch('btn-shoot', 'shoot');
