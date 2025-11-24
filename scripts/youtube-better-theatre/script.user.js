// ==UserScript==
// @name         YouTube Better Theatre
// @namespace    https://github.com/RHSD/userscripts
// @version      2.0
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

    // Inject CSS
    function addStyle(styleText, id) {
        if (document.getElementById(id)) return;
        const style = document.createElement('style');
        style.setAttribute("id", id);
        style.textContent = styleText;
        (document.head || document.documentElement).appendChild(style);
    }

    // Initialize theatre mode CSS immediately
    addStyle(theatreCSS, "youtube-theatre-enhancement");

    // Setup auto-hide top bar
    function setupAutoHide() {
        const masthead = document.querySelector("#masthead-container");
        if (!masthead) {
            requestAnimationFrame(setupAutoHide);
            return;
        }
        if (document.querySelector("#yt-masthead-wrapper")) return;

        // Inject top bar CSS
        addStyle(topBarCSS, "youtube-autohide-topbar");

        const trigger = document.createElement("div");
        trigger.id = "yt-autohide-trigger";
        const wrapper = document.createElement("div");
        wrapper.id = "yt-masthead-wrapper";

        // Insert trigger before masthead
        masthead.parentNode.insertBefore(trigger, masthead);
        // Move masthead inside wrapper
        wrapper.appendChild(masthead);
        // Insert wrapper after trigger
        trigger.after(wrapper);

        // Maintain visibility while hovering masthead
        wrapper.addEventListener("mouseenter", () => {
            wrapper.classList.add("visible");
        });
        wrapper.addEventListener("mouseleave", () => {
            wrapper.classList.remove("visible");
        });
    }

    // Ensure theatre CSS persists since youtube is a single page app
    setInterval(() => {
        addStyle(theatreCSS, "youtube-theatre-enhancement");
    }, 1000);

    // Start setup when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAutoHide);
    } else {
        setupAutoHide();
    }
})();