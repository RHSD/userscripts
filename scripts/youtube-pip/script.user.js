// ==UserScript==
// @name         YouTube Scroll PiP
// @namespace    https://github.com/RHSD/userscripts
// @version      4.0
// @description  YouTube Picture-in-Picture mode when scrolling past the video player
// @author       RHSD
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Constants
    const CONFIG = {
        storageKey: 'yt-pip-state',
        minWidth: 200,
        aspectRatio: 16 / 9,
        scrollEnterThreshold: 100,
        scrollExitThreshold: 50,
        transitionDelay: 200
    };

    const STYLES = `
        /* PiP container */
        ytd-watch-flexy[pip-mode] #player-container {
            position: fixed !important;
            z-index: 9999 !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            border-radius: 8px;
            overflow: visible !important;
            background: #000;
        }

        /* Force inner elements to fill container */
        ytd-watch-flexy[pip-mode] #player-container #movie_player,
        ytd-watch-flexy[pip-mode] #player-container .html5-video-container {
            width: 100% !important;
            height: 100% !important;
        }

        ytd-watch-flexy[pip-mode] #player-container video.html5-main-video {
            width: 100% !important;
            height: 100% !important;
            left: 0 !important;
            top: 0 !important;
            object-fit: contain;
            border-radius: 8px;
        }

        /* Force player UI to resize */
        ytd-watch-flexy[pip-mode] #player-container .ytp-chrome-bottom {
            width: 100% !important;
            left: 0 !important;
        }

        /* Collapse original player space */
        ytd-watch-flexy[pip-mode] #player-container-outer,
        ytd-watch-flexy[pip-mode] #player-container-inner {
            min-height: 0 !important;
            height: 0 !important;
        }

        /* Minimized state */
        ytd-watch-flexy[pip-mode][pip-minimized] #player-container {
            display: none !important;
        }

        /* Placeholder */
        #pip-placeholder {
            display: none;
        }
        ytd-watch-flexy[pip-mode] #pip-placeholder {
            display: block;
        }

        /* Minimize button */
        #pip-minimize-btn {
            position: absolute;
            top: 8px;
            left: 8px;
            width: 28px;
            height: 28px;
            background: rgba(0,0,0,0.7);
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 18px;
            line-height: 28px;
            cursor: pointer;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.2s, background 0.2s;
        }
        ytd-watch-flexy[pip-mode] #player-container:hover #pip-minimize-btn {
            opacity: 1;
        }
        #pip-minimize-btn:hover {
            background: rgba(255,255,255,0.3);
        }

        /* Restore button */
        #pip-restore-btn {
            position: fixed;
            width: 28px;
            height: 28px;
            background: rgba(0,0,0,0.7);
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 14px;
            cursor: move;
            z-index: 10001;
            display: none;
        }
        #pip-restore-btn:hover {
            background: rgba(255,255,255,0.3);
        }

        /* Resize handles */
        .pip-resize-handle {
            position: absolute;
            width: 16px;
            height: 16px;
            z-index: 10002;
        }
        .pip-resize-handle.nw { top: -4px; left: -4px; cursor: nw-resize; }
        .pip-resize-handle.ne { top: -4px; right: -4px; cursor: ne-resize; }
        .pip-resize-handle.sw { bottom: -4px; left: -4px; cursor: sw-resize; }
        .pip-resize-handle.se { bottom: -4px; right: -4px; cursor: se-resize; }

        /* Drag area */
        #pip-drag-area {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 40px;
            cursor: move;
            z-index: 10000;
        }
    `;

    // State
    let state = {
        active: false,
        minimized: false,
        transitioning: false,
        originalPlayerBottom: null,
        pip: loadPipState()
    };

    // DOM helpers
    const $ = sel => document.querySelector(sel);
    const create = (tag, props) => Object.assign(document.createElement(tag), props);
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    // State persistence
    function loadPipState() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || defaultPipState();
        } catch {
            return defaultPipState();
        }
    }

    function defaultPipState() {
        return { width: 400, height: 225, left: null, top: null };
    }

    function savePipState() {
        localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.pip));
    }

    // Drag/resize handler factory
    function makeDraggable(el, onMove, onEnd) {
        el.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startPip = { ...state.pip };

            const move = e => onMove(e.clientX - startX, e.clientY - startY, startPip);
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                savePipState();
                onEnd?.();
            };

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    // PiP positioning
    function applyPosition() {
        const container = $('#player-container');
        if (!container) return;

        const pip = state.pip;
        pip.left = clamp(pip.left, 0, window.innerWidth - pip.width);
        pip.top = clamp(pip.top, 0, window.innerHeight - pip.height);

        Object.assign(container.style, {
            width: `${pip.width}px`,
            height: `${pip.height}px`,
            left: `${pip.left}px`,
            top: `${pip.top}px`
        });
    }

    function triggerResize() {
        window.dispatchEvent(new Event('resize'));
    }

    // UI Setup
    function setupUI() {
        const container = $('#player-container');
        if (!container || container.dataset.pipSetup) return;
        container.dataset.pipSetup = 'true';

        // Minimize button
        const minBtn = create('button', { id: 'pip-minimize-btn', textContent: '−' });
        minBtn.onclick = e => { e.stopPropagation(); minimize(); };
        container.appendChild(minBtn);

        // Drag area
        const dragArea = create('div', { id: 'pip-drag-area' });
        makeDraggable(dragArea, (dx, dy, start) => {
            state.pip.left = start.left + dx;
            state.pip.top = start.top + dy;
            applyPosition();
        }, triggerResize);
        container.appendChild(dragArea);

        // Resize handles
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = create('div', { className: `pip-resize-handle ${dir}` });
            makeDraggable(handle, (dx, dy, start) => {
                const widthDelta = dir.includes('e') ? dx : -dx;
                const newWidth = Math.max(CONFIG.minWidth, start.width + widthDelta);
                const newHeight = newWidth / CONFIG.aspectRatio;

                state.pip.width = newWidth;
                state.pip.height = newHeight;
                state.pip.left = dir.includes('w') ? start.left + start.width - newWidth : start.left;
                state.pip.top = dir.includes('n') ? start.top + start.height - newHeight : start.top;
                applyPosition();
                triggerResize();
            });
            container.appendChild(handle);
        });

        // Placeholder
        if (!$('#pip-placeholder')) {
            const placeholder = create('div', { id: 'pip-placeholder' });
            const outer = $('#player-container-outer') || container.parentElement;
            outer?.parentElement?.insertBefore(placeholder, outer);
        }

        // Restore button
        if (!$('#pip-restore-btn')) {
            const btn = create('button', { id: 'pip-restore-btn', textContent: '▶' });
            setupRestoreButton(btn);
            document.body.appendChild(btn);
        }
    }

    function setupRestoreButton(btn) {
        let startX, startY, startLeft, startTop, hasMoved;

        btn.addEventListener('mousedown', e => {
            e.preventDefault();
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(btn.style.left) || 0;
            startTop = parseInt(btn.style.top) || 0;

            const move = e => {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
                btn.style.left = `${clamp(startLeft + dx, 0, window.innerWidth - 28)}px`;
                btn.style.top = `${clamp(startTop + dy, 0, window.innerHeight - 28)}px`;
            };

            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                state.pip.left = parseInt(btn.style.left) - 8;
                state.pip.top = parseInt(btn.style.top) - 8;
                savePipState();
                if (!hasMoved) restore();
            };

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    function updatePlaceholderHeight() {
        const placeholder = $('#pip-placeholder');
        const outer = $('#player-container-outer') || $('#player-container');
        if (placeholder && outer && !state.active) {
            placeholder.style.height = `${outer.offsetHeight}px`;
        }
    }

    // PiP controls
    function minimize() {
        state.minimized = true;
        $('ytd-watch-flexy')?.setAttribute('pip-minimized', '');

        const btn = $('#pip-restore-btn');
        if (btn) {
            btn.style.left = `${state.pip.left + 8}px`;
            btn.style.top = `${state.pip.top + 8}px`;
            btn.style.display = 'block';
        }
    }

    function restore() {
        state.minimized = false;
        $('ytd-watch-flexy')?.removeAttribute('pip-minimized');
        $('#pip-restore-btn').style.display = 'none';
        applyPosition();
    }

    function enablePip() {
        if (state.active || state.transitioning) return;

        const watchFlexy = $('ytd-watch-flexy');
        if (!watchFlexy || !$('#player-container')) return;

        state.transitioning = true;

        setupUI();
        updatePlaceholderHeight();

        if (state.pip.left === null) {
            state.pip.left = window.innerWidth - state.pip.width - 20;
            state.pip.top = window.innerHeight - state.pip.height - 20;
        }

        state.active = true;
        watchFlexy.setAttribute('pip-mode', '');
        applyPosition();

        requestAnimationFrame(() => {
            triggerResize();
            setTimeout(() => {
                triggerResize();
                state.transitioning = false;
            }, CONFIG.transitionDelay);
        });
    }

    function disablePip() {
        if (!state.active || state.transitioning) return;

        const watchFlexy = $('ytd-watch-flexy');
        const container = $('#player-container');

        state.transitioning = true;
        state.active = false;
        state.minimized = false;
        state.originalPlayerBottom = null;

        watchFlexy?.removeAttribute('pip-mode');
        watchFlexy?.removeAttribute('pip-minimized');
        $('#pip-restore-btn')?.style.setProperty('display', 'none');
        if (container) container.style.cssText = '';

        requestAnimationFrame(() => {
            triggerResize();
            setTimeout(() => {
                triggerResize();
                state.transitioning = false;
            }, CONFIG.transitionDelay);
        });
    }

    // Scroll handling
    function checkScroll() {
        if (!location.pathname.startsWith('/watch')) {
            if (state.active) disablePip();
            state.originalPlayerBottom = null;
            return;
        }

        if (state.transitioning) return;

        if (!state.active) {
            const container = $('#player-container');
            if (!container) return;

            const rect = container.getBoundingClientRect();
            if (rect.bottom < -CONFIG.scrollEnterThreshold) {
                state.originalPlayerBottom = window.scrollY + rect.bottom;
                enablePip();
            }
        } else if (state.originalPlayerBottom !== null) {
            if (window.scrollY < state.originalPlayerBottom - CONFIG.scrollExitThreshold) {
                disablePip();
            }
        }
    }

    let scrollTicking = false;
    function onScroll() {
        if (!scrollTicking) {
            requestAnimationFrame(() => {
                checkScroll();
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    }

    // Initialize
    function init() {
        if ($('#yt-pip-styles')) return;

        const style = create('style', { id: 'yt-pip-styles', textContent: STYLES });
        (document.head || document.documentElement).appendChild(style);

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('yt-navigate-finish', () => {
            state.originalPlayerBottom = null;
            disablePip();
        });
    }

    init();
})();