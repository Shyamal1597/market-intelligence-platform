"use client";

import { useEffect, useRef } from "react";

class Orb {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    targetX: number;
    targetY: number;

    constructor(width: number, height: number, color: string, radius: number) {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.targetX = this.x;
        this.targetY = this.y;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.radius = radius;
        this.color = color;
    }

    update(width: number, height: number, mouseX: number, mouseY: number) {
        // Very slow ambient wandering
        this.targetX += this.vx;
        this.targetY += this.vy;

        // Bounce targets off walls with very soft padding
        if (this.targetX < -this.radius) this.vx *= -1;
        if (this.targetX > width + this.radius) this.vx *= -1;
        if (this.targetY < -this.radius) this.vy *= -1;
        if (this.targetY > height + this.radius) this.vy *= -1;

        // Interactive Pull/Push: Softly drift away from or towards the mouse
        if (mouseX > 0 && mouseY > 0) {
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 600) {
                // Gentle repulsion
                const force = (600 - dist) / 600;
                this.targetX -= (dx / dist) * force * 2;
                this.targetY -= (dy / dist) * force * 2;
            }
        }

        // Smoothly ease actual position towards target position
        this.x += (this.targetX - this.x) * 0.01;
        this.y += (this.targetY - this.y) * 0.01;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);

        // Colors are passed in as rgba strings, we just fade the edges
        const coreColor = this.color.replace(/[\d.]+\)$/, "0.15)"); // core is 15% opacity
        const edgeColor = this.color.replace(/[\d.]+\)$/, "0)");    // edge is 0% opacity

        gradient.addColorStop(0, coreColor);
        gradient.addColorStop(1, edgeColor);

        ctx.fillStyle = gradient;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function InteractiveBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        let mouseX = -1000;
        let mouseY = -1000;

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const handleMouseLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        };

        const handleResize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseleave", handleMouseLeave);
        window.addEventListener("resize", handleResize);

        const orbs: Orb[] = [];

        // Premium brand colors: Amber, Tech Teal, Deep Navy/Indigo
        // Using large radii (600px - 1000px) to create smooth, blurry gradients
        orbs.push(new Orb(width, height, "rgba(245, 130, 13, 0)", 800)); // Amber
        orbs.push(new Orb(width, height, "rgba(0, 229, 255, 0)", 900));  // Teal
        orbs.push(new Orb(width, height, "rgba(99, 102, 241, 0)", 1000)); // Indigo/Purp
        orbs.push(new Orb(width, height, "rgba(0, 229, 255, 0)", 700));  // Teal accent

        let animationFrameId: number;

        const render = () => {
            // Clear but leave a tiny bit of trail for absolute smoothness
            ctx.clearRect(0, 0, width, height);

            // Draw an explicit, prominent interactive "torch" light mapping the cursor
            if (mouseX > 0 && mouseY > 0) {
                const torch = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 450);
                torch.addColorStop(0, "rgba(255, 255, 255, 0.08)");
                torch.addColorStop(0.2, "rgba(0, 229, 255, 0.04)");
                torch.addColorStop(0.6, "rgba(255, 170, 0, 0.015)");
                torch.addColorStop(1, "rgba(0, 0, 0, 0)");

                ctx.fillStyle = torch;
                ctx.fillRect(0, 0, width, height);
            }

            // Update and draw the large glassmorphism orbs
            orbs.forEach(orb => {
                orb.update(width, height, mouseX, mouseY);
                orb.draw(ctx);
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseleave", handleMouseLeave);
            window.removeEventListener("resize", handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-0 mix-blend-screen"
        />
    );
}
