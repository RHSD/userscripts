// ==UserScript==
// @name         YouTube Scroll PiP
// @namespace    https://github.com/RHSD/userscripts
// @version      3.1
// @description  YouTube Picture-in-Picture mode when scrolling past the video player
// @author       RHSD
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'yt-pip-state';
    const MIN_WIDTH = 200;
    const ASPECT_RATIO = 16 / 9;
    const SCROLL_THRESHOLD = 50;

    const STYLES = `
        ytd-watch-flexy[pip-mode] #player-container {
            position: fixed;
            z-index: 9999;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
            border-radius: 8px;
            overflow: visible;
            background: #000;
        }
        ytd-watch-flexy[pip-mode] #player-container video {
            object-fit: contain;
            border-radius: 8px;
        }
        ytd-watch-flexy[pip-mode][pip-minimized] #player-container {
            display: none;
        }

        /* Placeholder to prevent layout shift */
        #pip-placeholder {
            display: none;
        }
        ytd-watch-flexy[pip-mode] #pip-placeholder {
            display: block;
        }

        /* Controls */
        .pip-control-btn {
            position: absolute;
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
        .pip-control-btn:hover {
            background: rgba(255,255,255,0.3);
        }
        ytd-watch-flexy[pip-mode] #player-container:hover .pip-control-btn {
            opacity: 1;
        }
        #pip-minimize-btn { top: 8px; left: 8px; }

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
            top: 0; left: 0; right: 0;
            height: 40px;
            cursor: move;
            z-index: 10000;
        }
    `;

    // State
    let isActive = false;
    let isMinimized = false;
    let pipState = loadState();

    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || getDefaultState();
        } catch {
            return getDefaultState();
        }
    }

    function getDefaultState() {
        return { width: 400, height: 225, left: null, top: null };
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pipState));
    }

    // DOM helpers
    function $(sel) { return document.querySelector(sel); }
    function create(tag, props = {}) {
        const el = document.createElement(tag);
        Object.assign(el, props);
        return el;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    // Drag utility - calls onMove during drag, saves state on end
    function makeDraggable(el, onMove, onEnd) {
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startState = { ...pipState };

            function move(e) {
                onMove(e.clientX - startX, e.clientY - startY, startState);
            }

            function up() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                saveState();
                onEnd?.();
            }

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    function applyPipPosition() {
        const container = $('#player-container');
        if (!container) return;

        // Clamp to viewport
        pipState.left = clamp(pipState.left, 0, window.innerWidth - pipState.width);
        pipState.top = clamp(pipState.top, 0, window.innerHeight - pipState.height);

        Object.assign(container.style, {
            width: pipState.width + 'px',
            height: pipState.height + 'px',
            left: pipState.left + 'px',
            top: pipState.top + 'px'
        });
    }

    function triggerResize() {
        window.dispatchEvent(new Event('resize'));
    }

    // Setup PiP UI elements (called once)
    function setupPipUI() {
        const container = $('#player-container');
        if (!container || container.dataset.pipSetup) return;
        container.dataset.pipSetup = 'true';

        // Minimize button
        const minBtn = create('button', {
            id: 'pip-minimize-btn',
            className: 'pip-control-btn',
            textContent: '−',
            onclick: (e) => {
                e.stopPropagation();
                minimize();
            }
        });
        container.appendChild(minBtn);

        // Drag area
        const dragArea = create('div', { id: 'pip-drag-area' });
        makeDraggable(dragArea, (dx, dy, start) => {
            pipState.left = start.left + dx;
            pipState.top = start.top + dy;
            applyPipPosition();
        }, triggerResize);
        container.appendChild(dragArea);

        // Resize handles
        ['nw', 'ne', 'sw', 'se'].forEach(dir => {
            const handle = create('div', { className: `pip-resize-handle ${dir}` });
            makeDraggable(handle, (dx, dy, start) => {
                const widthDelta = dir.includes('e') ? dx : -dx;
                const newWidth = Math.max(MIN_WIDTH, start.width + widthDelta);
                const newHeight = newWidth / ASPECT_RATIO;

                pipState.width = newWidth;
                pipState.height = newHeight;
                pipState.left = dir.includes('w') ? start.left + start.width - newWidth : start.left;
                pipState.top = dir.includes('n') ? start.top + start.height - newHeight : start.top;
                applyPipPosition();
                triggerResize();
            });
            container.appendChild(handle);
        });

        // Placeholder for layout
        if (!$('#pip-placeholder')) {
            const placeholder = create('div', { id: 'pip-placeholder' });
            container.parentElement?.insertBefore(placeholder, container);
        }

        // Restore button (in body)
        if (!$('#pip-restore-btn')) {
            const restoreBtn = create('button', {
                id: 'pip-restore-btn',
                textContent: '▶'
            });
            setupRestoreButton(restoreBtn);
            document.body.appendChild(restoreBtn);
        }
    }

    function setupRestoreButton(btn) {
        let startX, startY, startLeft, startTop, hasMoved;

        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(btn.style.left) || 0;
            startTop = parseInt(btn.style.top) || 0;

            function move(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;

                btn.style.left = clamp(startLeft + dx, 0, window.innerWidth - 28) + 'px';
                btn.style.top = clamp(startTop + dy, 0, window.innerHeight - 28) + 'px';
            }

            function up() {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);

                // Update pip position to match button
                pipState.left = parseInt(btn.style.left) - 8;
                pipState.top = parseInt(btn.style.top) - 8;
                saveState();

                if (!hasMoved) restore();
            }

            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
        });
    }

    function updatePlaceholderHeight() {
        const container = $('#player-container');
        const placeholder = $('#pip-placeholder');
        if (container && placeholder && !isActive) {
            placeholder.style.height = container.offsetHeight + 'px';
        }
    }

    function minimize() {
        isMinimized = true;
        $('ytd-watch-flexy')?.setAttribute('pip-minimized', '');

        const restoreBtn = $('#pip-restore-btn');
        if (restoreBtn) {
            restoreBtn.style.left = (pipState.left + 8) + 'px';
            restoreBtn.style.top = (pipState.top + 8) + 'px';
            restoreBtn.style.display = 'block';
        }
    }

    function restore() {
        isMinimized = false;
        $('ytd-watch-flexy')?.removeAttribute('pip-minimized');
        $('#pip-restore-btn').style.display = 'none';
        applyPipPosition();
    }

    function enablePip() {
        if (isActive) return;

        const watchFlexy = $('ytd-watch-flexy');
        if (!watchFlexy || !$('#player-container')) return;

        setupPipUI();
        updatePlaceholderHeight();

        // Set default position if not set
        if (pipState.left === null) {
            pipState.left = window.innerWidth - pipState.width - 20;
            pipState.top = window.innerHeight - pipState.height - 20;
        }

        isActive = true;
        watchFlexy.setAttribute('pip-mode', '');
        applyPipPosition();
        requestAnimationFrame(triggerResize);
    }

    function disablePip() {
        if (!isActive) return;

        const watchFlexy = $('ytd-watch-flexy');
        const container = $('#player-container');

        isActive = false;
        isMinimized = false;

        watchFlexy?.removeAttribute('pip-mode');
        watchFlexy?.removeAttribute('pip-minimized');
        $('#pip-restore-btn')?.style.setProperty('display', 'none');

        if (container) {
            container.style.cssText = '';
        }

        requestAnimationFrame(triggerResize);
    }

    function getPlayerRect() {
        const container = $('#player-container');
        if (!container) return null;

        const target = isActive ? $('#pip-placeholder') || container.parentElement : container;
        return target?.getBoundingClientRect();
    }

    function checkScroll() {
        if (!location.pathname.startsWith('/watch')) {
            disablePip();
            return;
        }

        const rect = getPlayerRect();
        if (!rect) return;

        if (!isActive && rect.bottom < -SCROLL_THRESHOLD) {
            enablePip();
        } else if (isActive && rect.top > -SCROLL_THRESHOLD) {
            disablePip();
        }
    }

    // Throttled scroll handler
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

    // Init
    function init() {
        if ($('#yt-pip-styles')) return;

        const style = create('style', { id: 'yt-pip-styles', textContent: STYLES });
        (document.head || document.documentElement).appendChild(style);

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('yt-navigate-finish', disablePip);
    }

    init();
})();