// App: SLF runtime version badge
// Safe self-contained app-level module.
// Must never break userscript startup.

(function installSLFVersionBadge() {
    'use strict';

    try {
        const BADGE_ID = 'slf-version-inline-badge';
        const TARGET_SELECTOR = '.head-ui__information';

        function safeGetGlobal() {
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
            } catch (error) {}
            try {
                return window;
            } catch (error) {}
            return null;
        }

        function safeGetVersion() {
            try {
                const root = safeGetGlobal();
                const slf = root && root.SLF ? root.SLF : (typeof window !== 'undefined' ? window.SLF : null);

                return String(
                    (slf && slf.scriptVersion) ||
                    (slf && slf.versionInfo && slf.versionInfo.version) ||
                    ''
                ).trim();
            } catch (error) {
                return '';
            }
        }

        function safeGetTarget() {
            try {
                if (typeof document === 'undefined' || !document.querySelector) return null;
                return document.querySelector(TARGET_SELECTOR);
            } catch (error) {
                return null;
            }
        }

        function safeRemoveExisting() {
            try {
                const existing = document.getElementById(BADGE_ID);
                if (existing && existing.parentNode) {
                    existing.parentNode.removeChild(existing);
                }
            } catch (error) {}
        }

        function render() {
            try {
                const target = safeGetTarget();
                if (!target) return false;

                const version = safeGetVersion();
                if (!version) return false;

                safeRemoveExisting();

                const badge = document.createElement('span');
                badge.id = BADGE_ID;
                badge.textContent = ' • SLF ' + version;
                badge.title = 'SLF userscript version';
                badge.style.cssText = [
                    'color:#36ff00',
                    'font-weight:bold',
                    'font-size:10px',
                    'margin-left:6px',
                    'white-space:nowrap',
                    'text-shadow:0 1px 2px #000'
                ].join(';');

                target.appendChild(badge);
                return true;
            } catch (error) {
                return false;
            }
        }

        function start() {
            try {
                const run = function () {
                    try {
                        if (render()) return;

                        let tries = 0;
                        const maxTries = 40;

                        const timer = window.setInterval(function () {
                            try {
                                tries += 1;

                                if (render() || tries >= maxTries) {
                                    window.clearInterval(timer);
                                }
                            } catch (error) {
                                try {
                                    window.clearInterval(timer);
                                } catch (inner) {}
                            }
                        }, 250);
                    } catch (error) {}
                };

                if (typeof document === 'undefined') return;

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', run, { once: true });
                } else {
                    run();
                }
            } catch (error) {}
        }

        start();
    } catch (error) {}
})();
