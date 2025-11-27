// ==UserScript==
// @name         YouTube Better Theatre
// @namespace    https://github.com/RHSD/userscripts
// @version      2.1
// @description  Auto-hides YouTube top bar with hover reveal and enlarges the media player to fill the entire screen when in theatre mode.
// @author       RHSD
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?domain=youtube.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ===== AUTO-HIDE TOP BAR IN THEATRE MODE =====
    const topBarCSS = `
    /* Animation wrapper - only in theatre mode */
    html:has([is-theater-mode]) #yt-masthead-wrapper {
        position: fixed;
        top: -56px;
        left: 0;
        right: 0;
        height: 56px;
        z-index: 10000;
        opacity: 0;
        transition: top 0.25s ease, opacity 0.25s ease;
        pointer-events: none;
    }
    /* Trigger area = same height as masthead - only in theatre mode */
    html:has([is-theater-mode]) #yt-autohide-trigger {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 56px;
        background: transparent;
        z-index: 9999;
        pointer-events: auto;
    }
    /* When hovered, wrapper becomes visible + interactive - only in theatre mode */
    html:has([is-theater-mode]) #yt-autohide-trigger:hover ~ #yt-masthead-wrapper,
    html:has([is-theater-mode]) #yt-masthead-wrapper:hover,
    html:has([is-theater-mode]) #yt-masthead-wrapper.visible {
        top: 0 !important;
        opacity: 1 !important;
        pointer-events: auto !important;
    }
    html:has([is-theater-mode]) #page-manager {
        margin-top: 0 !important;
    }
    html:has([is-theater-mode]) #player-theater-container {
        min-height: 100vh !important;
    }
    `;

    // Credits to shanish_ @discord for Better Youtube Theatre Mode script.
    // https://greasyfork.org/en/scripts/436667-better-youtube-theatre-mode
    // ===== THEATRE MODE ENLARGE =====
    const theatreCSS = `
    :fullscreen #player-full-bleed-container,
    :fullscreen #full-bleed-container {
        max-height: calc(100vh) !important;
    }
    :has([is-theater-mode]) #player-full-bleed-container,
    :has([is-theater-mode]) #full-bleed-container {
        max-height: calc(100vh) !important;
        height: 100vh !important;
    }
    `;

    // Inject CSS with deduplication
    function addStyle(styleText, id) {
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.id = id;
        style.textContent = styleText;
        (document.head || document.documentElement).appendChild(style);
    }
    
    // Initialize theatre mode CSS immediately
    addStyle(theatreCSS, "youtube-theatre-enhancement");
    
    // Cleanup auto-hide elements
    function cleanupAutoHide() {
        const wrapper = document.querySelector("#yt-masthead-wrapper");
        const trigger = document.querySelector("#yt-autohide-trigger");
        
        if (wrapper) {
            const masthead = wrapper.querySelector("#masthead-container");
            if (masthead && wrapper.parentNode) {
                wrapper.parentNode.insertBefore(masthead, wrapper);
            }
            wrapper.remove();
        }
        if (trigger) {
            trigger.remove();
        }
    }
    
    // Setup auto-hide top bar (only on watch pages)
    function setupAutoHide() {
        const isWatchPage = window.location.pathname.startsWith('/watch');
        
        // Clean up if not on watch page
        if (!isWatchPage) {
            cleanupAutoHide();
            return;
        }
        
        // Check if already setup
        if (document.querySelector("#yt-masthead-wrapper")) return;
        
        // Wait for masthead to be available
        const masthead = document.querySelector("#masthead-container");
        if (!masthead) {
            requestAnimationFrame(setupAutoHide);
            return;
        }
        
        // Inject top bar CSS
        addStyle(topBarCSS, "youtube-autohide-topbar");
        
        // Create elements
        const trigger = document.createElement("div");
        trigger.id = "yt-autohide-trigger";
        const wrapper = document.createElement("div");
        wrapper.id = "yt-masthead-wrapper";
        
        // Insert and rearrange DOM
        masthead.parentNode.insertBefore(trigger, masthead);
        wrapper.appendChild(masthead);
        trigger.after(wrapper);
        
        // Maintain visibility while hovering
        wrapper.addEventListener("mouseenter", () => wrapper.classList.add("visible"));
        wrapper.addEventListener("mouseleave", () => wrapper.classList.remove("visible"));
    }
    
    // Watch for URL changes (YouTube SPA navigation)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setupAutoHide();
        }
    });
    urlObserver.observe(document.documentElement, {
        subtree: true,
        childList: true
    });
    
    // Ensure theatre CSS persists (YouTube may remove it)
    const styleChecker = setInterval(() => {
        addStyle(theatreCSS, "youtube-theatre-enhancement");
    }, 1000);
    
    // Initial setup
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAutoHide);
    } else {
        setupAutoHide();
    }
})();